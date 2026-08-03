import { DateTime } from "luxon";
import type {
  AnalyticsListResponse, AnalyticsMetricSet, AnalyticsSummaryResponse,
  AnalyticsTimeseriesPoint, AnalyticsTimeseriesResponse, ErrorFrequencyItem,
  FailingStepAnalyticsItem, RecentIssueItem, RegressionMetricSet,
  ScenarioAnalyticsItem, ScheduleAnalyticsItem, ScheduleMetricSet,
  SuiteAnalyticsItem, SuiteMetricSet
} from "../../../shared/types/analytics.js";
import type { RunResult, TestRun, TestRunDetail } from "../../../shared/types/test-run.js";
import type { TestRunComparison } from "../../../shared/types/test-run-comparison.js";
import type { TestScheduleExecution } from "../../../shared/types/test-schedule.js";
import type { TestSuiteRun, TestSuiteRunItem } from "../../../shared/types/test-suite.js";
import type { ProjectRepository } from "../../repositories/project.repository.js";
import type { ScenarioRepository } from "../../repositories/scenario.repository.js";
import type { TestRunRepository } from "../../repositories/test-run.repository.js";
import type { TestRunComparisonRepository } from "../../repositories/test-run-comparison.repository.js";
import type { TestSuiteRepository } from "../../repositories/test-suite.repository.js";
import type { TestSuiteRunRepository } from "../../repositories/test-suite-run.repository.js";
import type { TestSuiteRunItemRepository } from "../../repositories/test-suite-run-item.repository.js";
import type { TestScheduleRepository } from "../../repositories/test-schedule.repository.js";
import type { TestScheduleExecutionRepository } from "../../repositories/test-schedule-execution.repository.js";
import type { NotificationDeliveryRepository } from "../../repositories/notification-delivery.repository.js";
import type { TestRunService } from "../../services/test-run.service.js";
import { AppError } from "../../utils/api.js";
import type { AnalyticsQuery } from "../../validators/analytics-query.validator.js";
import { AnalyticsCache, stableCacheKey } from "../utils/analytics-cache.js";
import type { AnalyticsConfig } from "../utils/analytics-config.js";
import { errorFingerprint, sanitizeAnalyticsMessage } from "../utils/fingerprint.js";
import { compareMetric } from "../utils/metric-comparator.js";
import { determineQualityStatus } from "../utils/quality-status.js";
import { durationStatistics, safeRate } from "../utils/statistics.js";

const COMPLETED_RUN = new Set(["success", "failed", "blocked", "error"]);
const COMPLETED_SUITE = new Set(["success", "failed", "partial_success", "blocked", "cancelled", "error"]);
const COMPLETED_SCHEDULE = new Set(["completed", "skipped", "failed"]);

interface Dataset {
  project: Awaited<ReturnType<ProjectRepository["findById"]>> & {};
  scenarios: Awaited<ReturnType<ScenarioRepository["list"]>>;
  runs: TestRun[];
  details: Map<string, TestRunDetail>;
  comparisons: TestRunComparison[];
  suites: Awaited<ReturnType<TestSuiteRepository["list"]>>;
  suiteRuns: TestSuiteRun[];
  suiteItems: TestSuiteRunItem[];
  schedules: Awaited<ReturnType<TestScheduleRepository["list"]>>;
  executions: TestScheduleExecution[];
  deliveries: Awaited<ReturnType<NotificationDeliveryRepository["list"]>>;
}

export class ProjectAnalyticsService {
  private readonly cache: AnalyticsCache;
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly scenarioRepository: ScenarioRepository,
    private readonly testRunRepository: TestRunRepository,
    private readonly comparisonRepository: TestRunComparisonRepository,
    private readonly suiteRepository: TestSuiteRepository,
    private readonly suiteRunRepository: TestSuiteRunRepository,
    private readonly suiteItemRepository: TestSuiteRunItemRepository,
    private readonly scheduleRepository: TestScheduleRepository,
    private readonly executionRepository: TestScheduleExecutionRepository,
    private readonly deliveryRepository: NotificationDeliveryRepository,
    private readonly testRunService: TestRunService,
    private readonly config: AnalyticsConfig
  ) { this.cache = new AnalyticsCache(config.cacheTtlMs); }

  summary(projectId: string, query: AnalyticsQuery): Promise<AnalyticsSummaryResponse> {
    return this.cached("summary", projectId, query, async () => {
      const data = await this.load(projectId);
      const current = this.slice(data, query, query.startMs, query.endMs);
      const previous = this.slice(data, query, query.previousStartMs, query.previousEndMs);
      const metrics = aggregateRuns(current.runs);
      const previousMetrics = aggregateRuns(previous.runs);
      const regression = aggregateRegression(current.comparisons);
      const previousRegression = aggregateRegression(previous.comparisons);
      const suites = aggregateSuites(current.suiteRuns);
      const previousSuites = aggregateSuites(previous.suiteRuns);
      const schedules = aggregateSchedules(current.executions, data.deliveries);
      const previousSchedules = aggregateSchedules(previous.executions, data.deliveries);
      return {
        projectId, projectName: data.project.name, environmentName: data.project.environmentName,
        period: query.period, filters: query.filters, generatedAt: new Date().toISOString(),
        metrics, regression, suites, schedules,
        comparisons: {
          completedRuns: compareMetric(metrics.completedRuns, previousMetrics.completedRuns, "higher"),
          successRate: compareMetric(metrics.successRate, previousMetrics.successRate, "higher"),
          failureRate: compareMetric(metrics.failureRate, previousMetrics.failureRate, "lower"),
          errorRate: compareMetric(metrics.errorRate, previousMetrics.errorRate, "lower"),
          averageDurationMs: compareMetric(metrics.durations.averageMs, previousMetrics.durations.averageMs, "lower"),
          regressionRate: compareMetric(regression.regressionRate, previousRegression.regressionRate, "lower"),
          suiteSuccessRate: compareMetric(suites.successRate, previousSuites.successRate, "higher"),
          scheduleCompletionRate: compareMetric(schedules.completionRate, previousSchedules.completionRate, "higher")
        },
        quality: determineQualityStatus({ completedRuns: metrics.completedRuns, successRate: metrics.successRate, regressionRate: regression.regressionRate, errorRate: metrics.errorRate }, this.config)
      };
    });
  }

  timeseries(projectId: string, query: AnalyticsQuery): Promise<AnalyticsTimeseriesResponse> {
    return this.cached("timeseries", projectId, query, async () => {
      const data = this.slice(await this.load(projectId), query, query.startMs, query.endMs);
      const buckets = createBuckets(query.startMs, query.endMs, query.period.timezone, query.bucketUnit);
      if (buckets.length > this.config.maxTimeseriesPoints) throw new AppError(400, "INVALID_BUCKET_UNIT", "선택한 구간 단위로 생성되는 데이터 점이 너무 많습니다.");
      const points = buckets.map<AnalyticsTimeseriesPoint>((bucket) => {
        const runs = data.runs.filter((item) => inRange(runTime(item.run), bucket.startMs, bucket.endMs));
        const comparisons = data.comparisons.filter((item) => inRange(item.completedAt ?? item.updatedAt, bucket.startMs, bucket.endMs));
        const suiteRuns = data.suiteRuns.filter((item) => inRange(runTime(item), bucket.startMs, bucket.endMs));
        const metrics = aggregateRuns(runs);
        const regression = aggregateRegression(comparisons);
        const errorCounts = countRawErrors(runs);
        return {
          startDate: new Date(bucket.startMs).toISOString(), endDate: new Date(bucket.endMs).toISOString(), label: bucket.label,
          completedRuns: metrics.completedRuns, successCount: metrics.successCount, failedCount: metrics.failedCount,
          errorCount: metrics.errorCount, successRate: metrics.successRate,
          regressionCount: regression.regressionCount, resolvedCount: regression.resolvedCount,
          persistentFailureCount: regression.persistentFailureCount,
          averageDurationMs: metrics.durations.averageMs, medianDurationMs: metrics.durations.medianMs,
          p95DurationMs: metrics.durations.p95Ms,
          suiteAverageDurationMs: durationStatistics(suiteRuns.flatMap((run) => run.durationMs === undefined ? [] : [run.durationMs])).averageMs,
          ...errorCounts
        };
      });
      return { period: query.period, bucketUnit: query.bucketUnit, points, generatedAt: new Date().toISOString() };
    });
  }

  scenarios(projectId: string, query: AnalyticsQuery): Promise<AnalyticsListResponse<ScenarioAnalyticsItem>> {
    return this.cached("scenarios", projectId, query, async () => {
      const full = await this.load(projectId); const data = this.slice(full, query, query.startMs, query.endMs);
      const currentNames = new Map(full.scenarios.map((item) => [item.id, item.name]));
      const groups = Map.groupBy(data.runs, (item) => item.run.scenarioId);
      const items = [...groups].map(([scenarioId, runs]) => {
        const latest = [...runs].sort((a, b) => runTime(b.run).localeCompare(runTime(a.run)))[0];
        const name = latest?.result?.scenarioName ?? currentNames.get(scenarioId) ?? scenarioId;
        const comparisons = data.comparisons.filter((item) => item.scenarioId === scenarioId);
        return { scenarioId, scenarioName: name, deleted: !currentNames.has(scenarioId), runCount: runs.length,
          successRate: safeRate(runs.filter((item) => item.run.status === "success").length, runs.length),
          regressionRate: aggregateRegression(comparisons).regressionRate,
          averageDurationMs: aggregateRuns(runs).durations.averageMs,
          lastRunStatus: latest?.run.status ?? null, lastRunAt: latest === undefined ? null : runTime(latest.run) };
      }).sort((a, b) => b.runCount - a.runCount).slice(0, this.config.topScenariosLimit);
      return { items, generatedAt: new Date().toISOString() };
    });
  }

  failingSteps(projectId: string, query: AnalyticsQuery): Promise<AnalyticsListResponse<FailingStepAnalyticsItem>> {
    return this.cached("failing-steps", projectId, query, async () => {
      const data = this.slice(await this.load(projectId), query, query.startMs, query.endMs);
      const groups = new Map<string, { item: FailingStepAnalyticsItem; runs: Set<string> }>();
      for (const detail of data.runs) for (const step of detail.result?.steps ?? []) {
        if (step.status === "success") continue;
        const key = `${detail.run.scenarioId}:${step.stepId}`;
        const existing = groups.get(key);
        const occurredAt = step.finishedAt || runTime(detail.run);
        const fingerprint = step.errorMessage === null ? null : errorFingerprint("step", step.errorMessage);
        if (existing === undefined) groups.set(key, { runs: new Set([detail.run.id]), item: {
          scenarioId: detail.run.scenarioId, scenarioName: detail.result?.scenarioName ?? detail.run.scenarioId,
          stepId: step.stepId, stepName: step.stepName, action: step.action, failureCount: 1, affectedRunCount: 1,
          failureRate: null, lastFailedAt: occurredAt, lastRunId: detail.run.id,
          errorFingerprint: fingerprint, errorSample: step.errorMessage === null ? null : sanitizeAnalyticsMessage(step.errorMessage)
        }}); else { existing.item.failureCount += 1; existing.runs.add(detail.run.id); existing.item.affectedRunCount = existing.runs.size; if (occurredAt > existing.item.lastFailedAt) { existing.item.lastFailedAt = occurredAt; existing.item.lastRunId = detail.run.id; } }
      }
      const byScenario = new Map<string, number>(); data.runs.forEach((run) => byScenario.set(run.run.scenarioId, (byScenario.get(run.run.scenarioId) ?? 0) + 1));
      const items = [...groups.values()].map(({ item }) => ({ ...item, failureRate: safeRate(item.affectedRunCount, byScenario.get(item.scenarioId) ?? 0) }))
        .sort((a, b) => b.failureCount - a.failureCount || b.lastFailedAt.localeCompare(a.lastFailedAt)).slice(0, this.config.topStepsLimit);
      return { items, generatedAt: new Date().toISOString() };
    });
  }

  suites(projectId: string, query: AnalyticsQuery): Promise<AnalyticsListResponse<SuiteAnalyticsItem>> {
    return this.cached("suites", projectId, query, async () => {
      const full = await this.load(projectId); const data = this.slice(full, query, query.startMs, query.endMs);
      const names = new Map(full.suites.map((suite) => [suite.id, suite.name]));
      const items = [...Map.groupBy(data.suiteRuns, (run) => run.suiteId)].map(([suiteId, runs]) => {
        const latest = [...runs].sort((a, b) => runTime(b).localeCompare(runTime(a)))[0]; const metrics = aggregateSuites(runs);
        return { suiteId, suiteName: latest?.suiteSnapshot.suiteName ?? names.get(suiteId) ?? suiteId, deleted: !names.has(suiteId), runCount: runs.length,
          successRate: metrics.successRate, acceptableRate: metrics.acceptableRate, averageDurationMs: metrics.durations.averageMs,
          lastRunStatus: latest?.status ?? null, lastRunAt: latest === undefined ? null : runTime(latest) };
      }).sort((a, b) => b.runCount - a.runCount);
      return { items, generatedAt: new Date().toISOString() };
    });
  }

  schedules(projectId: string, query: AnalyticsQuery): Promise<AnalyticsListResponse<ScheduleAnalyticsItem>> {
    return this.cached("schedules", projectId, query, async () => {
      const full = await this.load(projectId); const data = this.slice(full, query, query.startMs, query.endMs);
      const names = new Map(full.schedules.map((schedule) => [schedule.id, schedule.name]));
      const items = [...Map.groupBy(data.executions, (execution) => execution.scheduleId)].map(([scheduleId, executions]) => {
        const latest = [...executions].sort((a, b) => executionTime(b).localeCompare(executionTime(a)))[0];
        const completed = executions.filter((item) => item.status === "completed").length;
        const deliveryFailures = full.deliveries.filter((item) => executions.some((execution) => execution.id === item.scheduleExecutionId) && item.status === "failed").length;
        const delays = executions.flatMap((item) => item.startedAt === undefined ? [] : [Math.max(0, Date.parse(item.startedAt) - Date.parse(item.scheduledFor))]);
        return { scheduleId, scheduleName: latest?.scheduleSnapshot.scheduleName ?? names.get(scheduleId) ?? scheduleId, deleted: !names.has(scheduleId), executionCount: executions.length,
          completionRate: safeRate(completed, executions.length), skippedCount: executions.filter((item) => item.status === "skipped").length,
          failedCount: executions.filter((item) => item.status === "failed").length, averageStartDelayMs: durationStatistics(delays).averageMs,
          notificationFailureCount: deliveryFailures, lastStatus: latest?.status ?? null, lastExecutedAt: latest === undefined ? null : executionTime(latest) };
      }).sort((a, b) => b.executionCount - a.executionCount);
      return { items, generatedAt: new Date().toISOString() };
    });
  }

  errors(projectId: string, query: AnalyticsQuery): Promise<AnalyticsListResponse<ErrorFrequencyItem>> {
    return this.cached("errors", projectId, query, async () => {
      const data = this.slice(await this.load(projectId), query, query.startMs, query.endMs);
      const groups = new Map<string, ErrorFrequencyItem & { runIds: Set<string> }>();
      const add = (kind: ErrorFrequencyItem["kind"], message: string | null | undefined, runId: string, at: string, statusCode: number | null = null) => {
        const sample = sanitizeAnalyticsMessage(message); const fingerprint = errorFingerprint(kind, `${statusCode ?? ""}:${sample}`); const key = `${kind}:${fingerprint}`; const old = groups.get(key);
        if (old === undefined) groups.set(key, { fingerprint, kind, message: sample, count: 1, affectedRunCount: 1, lastSeenAt: at, lastRunId: runId, statusCode, runIds: new Set([runId]) });
        else { old.count += 1; old.runIds.add(runId); old.affectedRunCount = old.runIds.size; if (at > old.lastSeenAt) { old.lastSeenAt = at; old.lastRunId = runId; } }
      };
      for (const detail of data.runs) {
        if (detail.run.errorMessage !== undefined) add("run", detail.run.errorMessage, detail.run.id, runTime(detail.run));
        for (const step of detail.result?.steps ?? []) if (step.status !== "success") add("step", step.errorMessage, detail.run.id, step.finishedAt);
        for (const log of detail.result?.consoleLogs ?? []) if (["error", "warning", "warn"].includes(log.type.toLowerCase())) add("console", log.text, detail.run.id, log.timestamp);
        for (const error of detail.result?.networkErrors ?? []) add("network", error.failureText ?? `${error.method} ${error.url}`, detail.run.id, error.timestamp, error.status);
      }
      const items = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, this.config.topErrorsLimit).map(({ runIds: _, ...item }) => item);
      return { items, generatedAt: new Date().toISOString() };
    });
  }

  recentIssues(projectId: string, query: AnalyticsQuery): Promise<AnalyticsListResponse<RecentIssueItem>> {
    return this.cached("recent-issues", projectId, query, async () => {
      const full = await this.load(projectId); const data = this.slice(full, query, query.startMs, query.endMs); const issues: RecentIssueItem[] = [];
      for (const detail of data.runs) if (detail.run.status !== "success") issues.push({ id: detail.run.id, type: "run_failure", severity: "error", title: `${detail.result?.scenarioName ?? detail.run.scenarioId} 실행 ${detail.run.status}`, occurredAt: runTime(detail.run), detail: sanitizeAnalyticsMessage(detail.run.errorMessage), href: `/projects/${projectId}/scenarios/${detail.run.scenarioId}/runs/${detail.run.id}` });
      for (const item of data.comparisons) if ((item.summary?.regressionCount ?? 0) > 0) issues.push({ id: item.id, type: "regression", severity: "warning", title: `회귀 ${item.summary?.regressionCount ?? 0}건 감지`, occurredAt: item.completedAt ?? item.updatedAt, detail: `해결 ${item.summary?.resolvedCount ?? 0}건, 지속 실패 ${item.summary?.persistentFailureCount ?? 0}건`, href: `/projects/${projectId}/scenarios/${item.scenarioId}/comparisons/${item.id}` });
      for (const run of data.suiteRuns) if (run.status !== "success" && run.status !== "partial_success") issues.push({ id: run.id, type: "suite_failure", severity: "error", title: `${run.suiteSnapshot.suiteName} 스위트 ${run.status}`, occurredAt: runTime(run), detail: sanitizeAnalyticsMessage(run.errorMessage), href: `/projects/${projectId}/test-suites/${run.suiteId}/runs/${run.id}` });
      for (const execution of data.executions) if (execution.status === "failed" || execution.status === "skipped") issues.push({ id: execution.id, type: "schedule_failure", severity: execution.status === "failed" ? "error" : "warning", title: `${execution.scheduleSnapshot.scheduleName} 예약 ${execution.status}`, occurredAt: executionTime(execution), detail: sanitizeAnalyticsMessage(execution.errorMessage ?? execution.skipReason), href: `/projects/${projectId}/schedules/${execution.scheduleId}/executions/${execution.id}` });
      const executionsById = new Map(data.executions.map((item) => [item.id, item]));
      for (const delivery of full.deliveries) if (delivery.status === "failed") {
        const execution = executionsById.get(delivery.scheduleExecutionId); if (execution === undefined) continue;
        issues.push({ id: delivery.id, type: "notification_failure", severity: "warning", title: `${execution.scheduleSnapshot.scheduleName} ${delivery.channel} 알림 실패`, occurredAt: delivery.updatedAt, detail: sanitizeAnalyticsMessage(delivery.errorMessage), href: `/projects/${projectId}/schedules/${execution.scheduleId}/executions/${execution.id}` });
      }
      return { items: issues.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, this.config.recentIssuesLimit), generatedAt: new Date().toISOString() };
    });
  }

  private async cached<T>(endpoint: string, projectId: string, query: AnalyticsQuery, loader: () => Promise<T>): Promise<T> {
    return this.cache.getOrSet(stableCacheKey({ endpoint, projectId, version: this.config.version, ...query.period, ...query.filters, bucketUnit: query.bucketUnit }), loader);
  }

  private async load(projectId: string): Promise<Dataset> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) throw new AppError(404, "ANALYTICS_PROJECT_NOT_FOUND", "분석할 프로젝트를 찾을 수 없습니다.");
    const [scenarios, storedRuns, comparisons, suites, suiteRuns, suiteItems, schedules, executions, deliveries] = await Promise.all([
      this.scenarioRepository.list(), this.testRunRepository.list(), this.comparisonRepository.list(), this.suiteRepository.list(),
      this.suiteRunRepository.list(), this.suiteItemRepository.list(), this.scheduleRepository.list(), this.executionRepository.list(), this.deliveryRepository.list()
    ]);
    const runs = storedRuns.filter((run) => run.projectId === projectId && COMPLETED_RUN.has(run.status));
    const details = new Map<string, TestRunDetail>();
    await Promise.all(runs.map(async (run) => { const detail = await this.testRunService.getDetail(run.id).catch(() => ({ run, result: null })); details.set(run.id, detail); }));
    return { project, scenarios: scenarios.filter((item) => item.projectId === projectId), runs,
      details, comparisons: comparisons.filter((item) => item.projectId === projectId && item.status === "completed"),
      suites: suites.filter((item) => item.projectId === projectId), suiteRuns: suiteRuns.filter((item) => item.projectId === projectId && COMPLETED_SUITE.has(item.status)), suiteItems,
      schedules: schedules.filter((item) => item.projectId === projectId), executions: executions.filter((item) => item.projectId === projectId && COMPLETED_SCHEDULE.has(item.status)), deliveries };
  }

  private slice(data: Dataset, query: AnalyticsQuery, startMs: number, endMs: number) {
    if (query.filters.environmentName !== null && query.filters.environmentName !== data.project.environmentName) return { runs: [] as TestRunDetail[], comparisons: [] as TestRunComparison[], suiteRuns: [] as TestSuiteRun[], executions: [] as TestScheduleExecution[] };
    const suiteRunById = new Map(data.suiteRuns.map((item) => [item.id, item]));
    const suiteItemByRunId = new Map(data.suiteItems.flatMap((item) => item.testRunId === undefined ? [] : [[item.testRunId, item] as const]));
    const executionBySuiteRun = new Map(data.executions.flatMap((item) => item.suiteRunId === undefined ? [] : [[item.suiteRunId, item] as const]));
    const suiteRunAllowed = (run: TestSuiteRun) => {
      const execution = executionBySuiteRun.get(run.id); const isSchedule = run.trigger === "schedule" || run.trigger === "schedule_manual_trigger";
      return (query.filters.trigger === "all" || (query.filters.trigger === "schedule") === isSchedule)
        && (query.filters.suiteId === null || run.suiteId === query.filters.suiteId)
        && (query.filters.scheduleId === null || execution?.scheduleId === query.filters.scheduleId);
    };
    const suiteRuns = data.suiteRuns.filter((run) => inRange(runTime(run), startMs, endMs) && suiteRunAllowed(run));
    const runs = data.runs.filter((run) => {
      const item = suiteItemByRunId.get(run.id); const suiteRun = item === undefined ? undefined : suiteRunById.get(item.suiteRunId);
      const isSchedule = suiteRun?.trigger === "schedule" || suiteRun?.trigger === "schedule_manual_trigger";
      return inRange(runTime(run), startMs, endMs)
        && (query.filters.trigger === "all" || (query.filters.trigger === "schedule") === isSchedule)
        && (query.filters.scenarioId === null || run.scenarioId === query.filters.scenarioId)
        && (query.filters.suiteId === null || suiteRun?.suiteId === query.filters.suiteId)
        && (query.filters.scheduleId === null || (suiteRun === undefined ? undefined : executionBySuiteRun.get(suiteRun.id)?.scheduleId) === query.filters.scheduleId);
    }).map((run) => data.details.get(run.id) ?? { run, result: null });
    const runIds = new Set(runs.map((item) => item.run.id));
    const comparisons = data.comparisons.filter((item) => inRange(item.completedAt ?? item.updatedAt, startMs, endMs)
      && runIds.has(item.comparisonRunId) && (query.filters.scenarioId === null || item.scenarioId === query.filters.scenarioId));
    const executions = data.executions.filter((item) => inRange(executionTime(item), startMs, endMs)
      && query.filters.trigger !== "manual" && (query.filters.suiteId === null || item.suiteId === query.filters.suiteId)
      && (query.filters.scheduleId === null || item.scheduleId === query.filters.scheduleId));
    return { runs, comparisons, suiteRuns, executions };
  }
}

function aggregateRuns(runs: TestRunDetail[]): AnalyticsMetricSet {
  const successCount = runs.filter((item) => item.run.status === "success").length;
  const failedCount = runs.filter((item) => item.run.status === "failed").length;
  const blockedCount = runs.filter((item) => item.run.status === "blocked").length;
  const errorCount = runs.filter((item) => item.run.status === "error").length;
  const totalSteps = runs.reduce((sum, item) => sum + item.run.totalSteps, 0);
  const successfulSteps = runs.reduce((sum, item) => sum + item.run.successCount, 0);
  const failedSteps = runs.reduce((sum, item) => sum + item.run.failedCount, 0);
  const blockedSteps = runs.reduce((sum, item) => sum + item.run.blockedCount, 0);
  const errorSteps = runs.reduce((sum, item) => sum + item.run.errorCount, 0);
  return { completedRuns: runs.length, successCount, failedCount, blockedCount, errorCount,
    successRate: safeRate(successCount, runs.length), failureRate: safeRate(failedCount + blockedCount, runs.length), errorRate: safeRate(errorCount, runs.length),
    totalSteps, successfulSteps, failedSteps, blockedSteps, errorSteps,
    stepSuccessRate: safeRate(successfulSteps, totalSteps), executedStepSuccessRate: safeRate(successfulSteps, successfulSteps + failedSteps + errorSteps),
    durations: durationStatistics(runs.flatMap((item) => item.run.durationMs === undefined ? [] : [item.run.durationMs])) };
}

function aggregateRegression(items: TestRunComparison[]): RegressionMetricSet {
  const regressionCount = items.reduce((sum, item) => sum + (item.summary?.regressionCount ?? 0), 0);
  const resolvedCount = items.reduce((sum, item) => sum + (item.summary?.resolvedCount ?? 0), 0);
  const persistentFailureCount = items.reduce((sum, item) => sum + (item.summary?.persistentFailureCount ?? 0), 0);
  const comparisonsWithRegression = items.filter((item) => (item.summary?.regressionCount ?? 0) > 0).length;
  const comparedSteps = items.reduce((sum, item) => sum + (item.summary?.matchedSteps ?? 0) + (item.summary?.addedSteps ?? 0), 0);
  return { completedComparisons: items.length, comparisonsWithRegression, regressionRate: safeRate(comparisonsWithRegression, items.length), regressionCount, resolvedCount, persistentFailureCount, stepRegressionRate: safeRate(regressionCount, comparedSteps) };
}

function aggregateSuites(runs: TestSuiteRun[]): SuiteMetricSet {
  const count = (status: string) => runs.filter((item) => item.status === status).length;
  const successCount = count("success"), partialSuccessCount = count("partial_success");
  return { completedRuns: runs.length, successCount, partialSuccessCount, failedCount: count("failed"), blockedCount: count("blocked"), cancelledCount: count("cancelled"), errorCount: count("error"),
    successRate: safeRate(successCount, runs.length), acceptableRate: safeRate(successCount + partialSuccessCount, runs.length), durations: durationStatistics(runs.flatMap((item) => item.durationMs === undefined ? [] : [item.durationMs])) };
}

function aggregateSchedules(executions: TestScheduleExecution[], deliveries: Dataset["deliveries"]): ScheduleMetricSet {
  const executionIds = new Set(executions.map((item) => item.id)); const relevantDeliveries = deliveries.filter((item) => executionIds.has(item.scheduleExecutionId));
  const completedCount = executions.filter((item) => item.status === "completed").length;
  const skipText = (item: TestScheduleExecution) => `${item.errorCode ?? ""} ${item.skipReason ?? ""}`.toLowerCase();
  return { detectedCount: executions.length, completedCount, skippedCount: executions.filter((item) => item.status === "skipped").length, failedCount: executions.filter((item) => item.status === "failed").length,
    completionRate: safeRate(completedCount, executions.length), suiteRunCreatedCount: executions.filter((item) => item.suiteRunId !== undefined).length,
    concurrencySkipCount: executions.filter((item) => item.status === "skipped" && skipText(item).includes("concurr")).length,
    missedSkipCount: executions.filter((item) => item.status === "skipped" && skipText(item).includes("miss")).length,
    averageDetectionDelayMs: durationStatistics(executions.map((item) => Math.max(0, Date.parse(item.detectedAt) - Date.parse(item.scheduledFor)))).averageMs,
    averageStartDelayMs: durationStatistics(executions.flatMap((item) => item.startedAt === undefined ? [] : [Math.max(0, Date.parse(item.startedAt) - Date.parse(item.scheduledFor))])).averageMs,
    notificationSentCount: relevantDeliveries.filter((item) => item.status === "sent").length, notificationFailedCount: relevantDeliveries.filter((item) => item.status === "failed").length };
}

function countRawErrors(runs: TestRunDetail[]) {
  let consoleErrorCount = 0, networkErrorCount = 0, http4xxCount = 0, http5xxCount = 0, timeoutCount = 0;
  for (const detail of runs) {
    consoleErrorCount += (detail.result?.consoleLogs ?? []).filter((item) => ["error", "warning", "warn"].includes(item.type.toLowerCase())).length;
    for (const item of detail.result?.networkErrors ?? []) { networkErrorCount += 1; if (item.status !== null && item.status >= 400 && item.status < 500) http4xxCount += 1; if (item.status !== null && item.status >= 500) http5xxCount += 1; if ((item.failureText ?? "").toLowerCase().includes("timeout")) timeoutCount += 1; }
  }
  return { consoleErrorCount, networkErrorCount, http4xxCount, http5xxCount, timeoutCount };
}

function createBuckets(startMs: number, endMs: number, timezone: string, unit: "hour" | "day" | "week" | "month") {
  const result: Array<{ startMs: number; endMs: number; label: string }> = [];
  let cursor = DateTime.fromMillis(startMs, { zone: timezone }).startOf(unit);
  while (cursor.toMillis() <= endMs) {
    const next = cursor.plus({ [`${unit}s`]: 1 }); const bucketStart = Math.max(startMs, cursor.toMillis()); const bucketEnd = Math.min(endMs, next.toMillis() - 1);
    result.push({ startMs: bucketStart, endMs: bucketEnd, label: unit === "hour" ? cursor.toFormat("MM-dd HH:mm") : unit === "month" ? cursor.toFormat("yyyy-MM") : cursor.toFormat("MM-dd") }); cursor = next;
    if (result.length > 10_000) break;
  }
  return result;
}

function inRange(value: string, startMs: number, endMs: number): boolean { const timestamp = Date.parse(value); return Number.isFinite(timestamp) && timestamp >= startMs && timestamp <= endMs; }
function runTime(run: { finishedAt?: string; createdAt: string }): string { return run.finishedAt ?? run.createdAt; }
function executionTime(item: TestScheduleExecution): string { return item.finishedAt ?? item.detectedAt ?? item.createdAt; }
