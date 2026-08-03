import type { AppNotificationType } from "../../../shared/types/notification.js";
import type { TestScheduleExecution, TestScheduleSnapshot } from "../../../shared/types/test-schedule.js";
import type { TestSuiteRun, TestSuiteRunStatus } from "../../../shared/types/test-suite.js";
import type { TestRunComparisonService } from "../../comparisons/services/test-run-comparison.service.js";
import type { NotificationDeliveryService, ScheduleNotificationEvent } from "../../notifications/services/notification-delivery.service.js";
import type { TestScheduleExecutionRepository } from "../../repositories/test-schedule-execution.repository.js";
import type { TestScheduleRepository } from "../../repositories/test-schedule.repository.js";
import type { TestSuiteRepository } from "../../repositories/test-suite.repository.js";
import type { TestSuiteRunItemRepository } from "../../repositories/test-suite-run-item.repository.js";
import type { TestSuiteRunRepository } from "../../repositories/test-suite-run.repository.js";
import type { TestSuiteRunService } from "../../services/test-suite-run.service.js";
import { AppError } from "../../utils/api.js";
import { nowIso } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import { toPublicErrorMessage } from "../../utils/sanitize.js";
import type { StoredTestSchedule } from "../types/storage.js";
import { calculateNextRunAt, mostRecentDueOccurrence } from "../utils/next-run-calculator.js";
import type { TestScheduleRuntimeConfig } from "../utils/schedule-config.js";

const scheduleLocks = new Set<string>();

export class TestSchedulerService {
  private ticking = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastTickAt: string | undefined;

  constructor(
    private readonly scheduleRepository: TestScheduleRepository,
    private readonly executionRepository: TestScheduleExecutionRepository,
    private readonly suiteRepository: TestSuiteRepository,
    private readonly suiteRunRepository: TestSuiteRunRepository,
    private readonly suiteRunItemRepository: TestSuiteRunItemRepository,
    private readonly suiteRunService: TestSuiteRunService,
    private readonly comparisonService: TestRunComparisonService,
    private readonly notifications: NotificationDeliveryService,
    private readonly config: TestScheduleRuntimeConfig
  ) {}

  start(): void {
    if (!this.config.enabled || this.timer !== undefined) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.config.tickIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  getHealth(): {
    enabled: boolean;
    running: boolean;
    ticking: boolean;
    lastTickAt?: string;
  } {
    return {
      enabled: this.config.enabled,
      running: this.timer !== undefined,
      ticking: this.ticking,
      ...(this.lastTickAt === undefined ? {} : { lastTickAt: this.lastTickAt })
    };
  }

  async tick(at = nowIso()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const execution of await this.executionRepository.listQueued()) {
        await this.tryExecuteQueued(execution);
      }
      for (const schedule of await this.scheduleRepository.listDue(at)) {
        await this.detectDue(schedule, at);
      }
    } finally {
      this.lastTickAt = nowIso();
      this.ticking = false;
    }
  }

  async runNow(projectId: string, scheduleId: string): Promise<TestScheduleExecution> {
    if (!this.config.enabled) throw new AppError(503, "TEST_SCHEDULER_DISABLED", "예약 실행 기능이 비활성화되어 있습니다. TEST_SCHEDULER_ENABLED 설정을 확인해 주세요.");
    const schedule = await this.scheduleRepository.findById(scheduleId);
    if (schedule === null || schedule.deletedAt !== undefined) throw new AppError(404, "TEST_SCHEDULE_NOT_FOUND", "테스트 예약을 찾을 수 없습니다.");
    if (schedule.projectId !== projectId) throw new AppError(409, "TEST_SCHEDULE_PROJECT_MISMATCH", "예약이 프로젝트에 속하지 않습니다.");
    const execution = await this.createExecution(schedule, nowIso(), "schedule_manual_trigger");
    await this.handleConcurrency(schedule, execution);
    return (await this.executionRepository.findById(execution.id)) ?? execution;
  }

  private async detectDue(schedule: StoredTestSchedule, at: string): Promise<void> {
    if (scheduleLocks.has(schedule.id) || schedule.nextRunAt === undefined) return;
    scheduleLocks.add(schedule.id);
    try {
      const originalDue = schedule.nextRunAt;
      const lateByMs = Math.max(0, Date.parse(at) - Date.parse(originalDue));
      const missed = lateByMs > this.config.tickIntervalMs * 2;
      const scheduledFor = missed && schedule.missedRunPolicy === "run_once"
        ? mostRecentDueOccurrence(schedule.scheduleConfig, schedule.timezone, originalDue, at)
        : originalDue;
      await this.advanceSchedule(schedule, at);
      const execution = await this.createExecution(schedule, scheduledFor, "schedule");
      if (missed && schedule.missedRunPolicy === "skip") {
        const skipped = await this.patchExecution(execution.id, { status: "skipped", errorCode: "TEST_SCHEDULE_MISSED_RUN_SKIPPED", skipReason: "서버 중단 중 놓친 예약을 건너뛰었습니다.", finishedAt: at, updatedAt: at });
        await this.notifyIfNeeded(schedule, skipped);
        return;
      }
      await this.handleConcurrency(schedule, execution);
    } finally {
      scheduleLocks.delete(schedule.id);
    }
  }

  private async handleConcurrency(schedule: StoredTestSchedule, execution: TestScheduleExecution): Promise<void> {
    const activeRun = (await this.suiteRunRepository.listBySuite(schedule.suiteId)).find((run) => run.status === "pending" || run.status === "running");
    if (activeRun !== undefined) {
      if (schedule.concurrencyPolicy === "skip") {
        const timestamp = nowIso();
        const skipped = await this.patchExecution(execution.id, { status: "skipped", errorCode: "TEST_SCHEDULE_CONCURRENCY_SKIPPED", skipReason: `진행 중인 스위트 실행(${activeRun.id}) 때문에 건너뛰었습니다.`, finishedAt: timestamp, updatedAt: timestamp });
        await this.notifyIfNeeded(schedule, skipped);
      } else {
        const queued = await this.executionRepository.findQueuedBySchedule(schedule.id);
        if (queued !== null && queued.id !== execution.id) {
          const timestamp = nowIso();
          await this.patchExecution(execution.id, { status: "skipped", skipReason: "이미 한 건의 예약 실행이 대기 중입니다.", finishedAt: timestamp, updatedAt: timestamp });
        } else await this.patchExecution(execution.id, { status: "queued", updatedAt: nowIso() });
      }
      return;
    }
    await this.execute(schedule, execution);
  }

  private async tryExecuteQueued(execution: TestScheduleExecution): Promise<void> {
    const schedule = await this.scheduleRepository.findById(execution.scheduleId);
    if (schedule === null || schedule.deletedAt !== undefined) {
      await this.patchExecution(execution.id, { status: "skipped", skipReason: "예약이 삭제되어 대기 실행을 취소했습니다.", finishedAt: nowIso(), updatedAt: nowIso() });
      return;
    }
    const active = (await this.suiteRunRepository.listBySuite(schedule.suiteId)).some((run) => run.status === "pending" || run.status === "running");
    if (!active) await this.execute(schedule, execution);
  }

  private async execute(schedule: StoredTestSchedule, execution: TestScheduleExecution): Promise<void> {
    const timestamp = nowIso();
    try {
      const suiteRun = await this.suiteRunService.requestRun({
        projectId: schedule.projectId,
        suiteId: schedule.suiteId,
        trigger: execution.trigger,
        scheduleTriggerInfo: { scheduleId: schedule.id, scheduleExecutionId: execution.id, scheduledFor: execution.scheduledFor }
      });
      await this.patchExecution(execution.id, { status: "running", suiteRunId: suiteRun.id, startedAt: timestamp, updatedAt: timestamp });
      await this.suiteRunService.executeRun(suiteRun.id);
      const completedRun = (await this.suiteRunRepository.findById(suiteRun.id)) ?? suiteRun;
      const regressions = await this.compareWithPrevious(completedRun);
      const finishedAt = nowIso();
      const completed = await this.patchExecution(execution.id, {
        status: "completed", suiteRunStatus: completedRun.status,
        regressionCount: regressions.count, comparisonIds: regressions.ids,
        finishedAt, updatedAt: finishedAt
      });
      await this.scheduleRepository.patch(schedule.id, {
        lastRunAt: finishedAt, lastRunStatus: completedRun.status,
        lastScheduleExecutionId: execution.id, updatedAt: finishedAt
      });
      await this.notifyIfNeeded(schedule, completed);
    } catch (error: unknown) {
      const finishedAt = nowIso();
      const failed = await this.patchExecution(execution.id, {
        status: "failed", errorCode: error instanceof AppError ? error.code : "TEST_SCHEDULE_EXECUTION_FAILED",
        errorMessage: toPublicErrorMessage(error), finishedAt, updatedAt: finishedAt
      });
      await this.notifyIfNeeded(schedule, failed);
    }
  }

  private async compareWithPrevious(current: TestSuiteRun): Promise<{ count: number; ids: string[] }> {
    const priorRuns = (await this.suiteRunRepository.listBySuite(current.suiteId))
      .filter((run) => run.id !== current.id && run.finishedAt !== undefined)
      .sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt));
    const previous = priorRuns[0];
    if (previous === undefined) return { count: 0, ids: [] };
    const [baselineItems, currentItems] = await Promise.all([
      this.suiteRunItemRepository.listByRun(previous.id),
      this.suiteRunItemRepository.listByRun(current.id)
    ]);
    let count = 0;
    const ids: string[] = [];
    for (const item of currentItems) {
      const baseline = baselineItems.find((candidate) => candidate.scenarioId === item.scenarioId && candidate.testRunId !== undefined);
      if (baseline?.testRunId === undefined || item.testRunId === undefined) continue;
      try {
        const accepted = await this.comparisonService.requestComparison({ baselineRunId: baseline.testRunId, comparisonRunId: item.testRunId });
        await this.comparisonService.executeComparison(accepted.comparisonId);
        const result = await this.comparisonService.get(accepted.comparisonId);
        if (result.status === "completed") {
          ids.push(result.id);
          count += result.summary?.regressionCount ?? (result.runChangeType === "regression" ? 1 : 0);
        }
      } catch {
        // Comparison is supplementary; a comparison failure must not change suite status.
      }
    }
    return { count, ids };
  }

  private async advanceSchedule(schedule: StoredTestSchedule, at: string): Promise<void> {
    if (schedule.scheduleType === "once") {
      const updated = { ...schedule, status: "inactive" as const, updatedAt: at };
      delete updated.nextRunAt;
      await this.scheduleRepository.update(schedule.id, updated);
      return;
    }
    const nextRunAt = calculateNextRunAt(schedule.scheduleConfig, schedule.timezone, at);
    if (nextRunAt === undefined) throw new AppError(500, "TEST_SCHEDULE_NEXT_RUN_FAILED", "다음 예약 시각을 계산할 수 없습니다.");
    await this.scheduleRepository.patch(schedule.id, { nextRunAt, updatedAt: at });
  }

  private async createExecution(schedule: StoredTestSchedule, scheduledFor: string, trigger: TestScheduleExecution["trigger"]): Promise<TestScheduleExecution> {
    const suite = await this.suiteRepository.findById(schedule.suiteId);
    if (suite === null) throw new AppError(404, "TEST_SUITE_NOT_FOUND", "예약된 테스트 스위트를 찾을 수 없습니다.");
    const timestamp = nowIso();
    const execution: TestScheduleExecution = {
      id: createId("schedule-execution"), scheduleId: schedule.id, projectId: schedule.projectId,
      suiteId: schedule.suiteId, status: "detected", trigger, scheduledFor, detectedAt: timestamp,
      scheduleSnapshot: snapshot(schedule, suite.name, timestamp), regressionCount: 0, comparisonIds: [],
      retryCount: 0, version: this.config.version, createdAt: timestamp, updatedAt: timestamp
    };
    const created = await this.executionRepository.createUnique(execution);
    if (created === null) throw new AppError(409, "TEST_SCHEDULE_EXECUTION_DUPLICATED", "동일한 예약 시각의 실행 기록이 이미 있습니다.");
    return created;
  }

  private async patchExecution(id: string, changes: Partial<TestScheduleExecution>): Promise<TestScheduleExecution> {
    const saved = await this.executionRepository.patch(id, changes);
    if (saved === null) throw new AppError(404, "TEST_SCHEDULE_EXECUTION_NOT_FOUND", "예약 실행 기록을 찾을 수 없습니다.");
    return saved;
  }

  private async notifyIfNeeded(schedule: StoredTestSchedule, execution: TestScheduleExecution): Promise<void> {
    const event = notificationEvent(schedule, execution);
    if (event !== null) await this.notifications.deliver(schedule, execution, event);
  }
}

function snapshot(schedule: StoredTestSchedule, suiteName: string, capturedAt: string): TestScheduleSnapshot {
  return {
    scheduleName: schedule.name, suiteId: schedule.suiteId, suiteName,
    timezone: schedule.timezone, scheduleType: schedule.scheduleType,
    scheduleConfig: schedule.scheduleConfig, concurrencyPolicy: schedule.concurrencyPolicy,
    missedRunPolicy: schedule.missedRunPolicy, notificationPolicy: schedule.notificationPolicy,
    capturedAt
  };
}

function notificationEvent(schedule: StoredTestSchedule, execution: TestScheduleExecution): ScheduleNotificationEvent | null {
  const suiteStatus = execution.suiteRunStatus;
  let type: AppNotificationType;
  let title: string;
  let severity: ScheduleNotificationEvent["severity"];
  let enabled = false;
  if (execution.status === "skipped") {
    type = "schedule_execution_skipped"; title = "예약 실행을 건너뛰었습니다"; severity = "warning"; enabled = schedule.notificationPolicy.notifyOnScheduleError;
  } else if (execution.status === "failed") {
    type = "schedule_execution_failed"; title = "예약 실행에 실패했습니다"; severity = "error"; enabled = schedule.notificationPolicy.notifyOnScheduleError;
  } else if (execution.regressionCount > 0) {
    type = "regression_detected"; title = `회귀 ${execution.regressionCount}건을 감지했습니다`; severity = "warning"; enabled = schedule.notificationPolicy.notifyOnRegression;
  } else if (suiteStatus === "success") {
    type = "suite_run_success"; title = "예약 스위트 실행에 성공했습니다"; severity = "success"; enabled = schedule.notificationPolicy.notifyOnSuccess;
  } else if (suiteStatus === "partial_success") {
    type = "suite_run_partial_success"; title = "예약 스위트가 부분 성공했습니다"; severity = "warning"; enabled = schedule.notificationPolicy.notifyOnPartialSuccess;
  } else {
    type = "suite_run_failed"; title = "예약 스위트 실행에 실패했습니다"; severity = "error"; enabled = schedule.notificationPolicy.notifyOnFailure;
  }
  if (!enabled) return null;
  const message = execution.errorMessage ?? execution.skipReason ?? `상태: ${suiteStatus ?? execution.status}`;
  return { type, title, message, severity, ...(execution.suiteRunId === undefined ? {} : { suiteRunId: execution.suiteRunId }) };
}
