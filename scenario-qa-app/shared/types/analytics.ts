export type AnalyticsTrigger = "all" | "manual" | "schedule";
export type AnalyticsBucketUnit = "hour" | "day" | "week" | "month";
export type MetricDirection = "improved" | "degraded" | "unchanged" | "not_comparable";
export type QualityState = "healthy" | "warning" | "danger" | "insufficient";

export interface AnalyticsPeriod {
  startDate: string;
  endDate: string;
  timezone: string;
  previousStartDate: string;
  previousEndDate: string;
}

export interface AnalyticsFilters {
  trigger: AnalyticsTrigger;
  scenarioId: string | null;
  suiteId: string | null;
  scheduleId: string | null;
  environmentName: string | null;
}

export interface MetricComparison {
  current: number | null;
  previous: number | null;
  difference: number | null;
  changeRate: number | null;
  direction: MetricDirection;
  favorable: "higher" | "lower";
}

export interface DurationStatistics {
  count: number;
  averageMs: number | null;
  medianMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  p95Ms: number | null;
}

export interface AnalyticsMetricSet {
  completedRuns: number;
  successCount: number;
  failedCount: number;
  blockedCount: number;
  errorCount: number;
  successRate: number | null;
  failureRate: number | null;
  errorRate: number | null;
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  blockedSteps: number;
  errorSteps: number;
  stepSuccessRate: number | null;
  executedStepSuccessRate: number | null;
  durations: DurationStatistics;
}

export interface RegressionMetricSet {
  completedComparisons: number;
  comparisonsWithRegression: number;
  regressionRate: number | null;
  regressionCount: number;
  resolvedCount: number;
  persistentFailureCount: number;
  stepRegressionRate: number | null;
}

export interface SuiteMetricSet {
  completedRuns: number;
  successCount: number;
  partialSuccessCount: number;
  failedCount: number;
  blockedCount: number;
  cancelledCount: number;
  errorCount: number;
  successRate: number | null;
  acceptableRate: number | null;
  durations: DurationStatistics;
}

export interface ScheduleMetricSet {
  detectedCount: number;
  completedCount: number;
  skippedCount: number;
  failedCount: number;
  completionRate: number | null;
  suiteRunCreatedCount: number;
  concurrencySkipCount: number;
  missedSkipCount: number;
  averageDetectionDelayMs: number | null;
  averageStartDelayMs: number | null;
  notificationSentCount: number;
  notificationFailedCount: number;
}

export interface QualityStatusSummary {
  state: QualityState;
  reasons: string[];
  sampleSize: number;
}

export interface AnalyticsSummaryResponse {
  projectId: string;
  projectName: string;
  environmentName: string;
  period: AnalyticsPeriod;
  filters: AnalyticsFilters;
  generatedAt: string;
  metrics: AnalyticsMetricSet;
  regression: RegressionMetricSet;
  suites: SuiteMetricSet;
  schedules: ScheduleMetricSet;
  comparisons: {
    completedRuns: MetricComparison;
    successRate: MetricComparison;
    failureRate: MetricComparison;
    errorRate: MetricComparison;
    averageDurationMs: MetricComparison;
    regressionRate: MetricComparison;
    suiteSuccessRate: MetricComparison;
    scheduleCompletionRate: MetricComparison;
  };
  quality: QualityStatusSummary;
}

export interface AnalyticsTimeseriesPoint {
  startDate: string;
  endDate: string;
  label: string;
  completedRuns: number;
  successCount: number;
  failedCount: number;
  errorCount: number;
  successRate: number | null;
  regressionCount: number;
  resolvedCount: number;
  persistentFailureCount: number;
  averageDurationMs: number | null;
  medianDurationMs: number | null;
  p95DurationMs: number | null;
  suiteAverageDurationMs: number | null;
  consoleErrorCount: number;
  networkErrorCount: number;
  http4xxCount: number;
  http5xxCount: number;
  timeoutCount: number;
}

export interface AnalyticsTimeseriesResponse {
  period: AnalyticsPeriod;
  bucketUnit: AnalyticsBucketUnit;
  points: AnalyticsTimeseriesPoint[];
  generatedAt: string;
}

export interface ScenarioAnalyticsItem {
  scenarioId: string;
  scenarioName: string;
  deleted: boolean;
  runCount: number;
  successRate: number | null;
  regressionRate: number | null;
  averageDurationMs: number | null;
  lastRunStatus: string | null;
  lastRunAt: string | null;
}

export interface FailingStepAnalyticsItem {
  scenarioId: string;
  scenarioName: string;
  stepId: string;
  stepName: string;
  action: string;
  failureCount: number;
  affectedRunCount: number;
  failureRate: number | null;
  lastFailedAt: string;
  lastRunId: string;
  errorFingerprint: string | null;
  errorSample: string | null;
}

export interface SuiteAnalyticsItem {
  suiteId: string;
  suiteName: string;
  deleted: boolean;
  runCount: number;
  successRate: number | null;
  acceptableRate: number | null;
  averageDurationMs: number | null;
  lastRunStatus: string | null;
  lastRunAt: string | null;
}

export interface ScheduleAnalyticsItem {
  scheduleId: string;
  scheduleName: string;
  deleted: boolean;
  executionCount: number;
  completionRate: number | null;
  skippedCount: number;
  failedCount: number;
  averageStartDelayMs: number | null;
  notificationFailureCount: number;
  lastStatus: string | null;
  lastExecutedAt: string | null;
}

export interface ErrorFrequencyItem {
  fingerprint: string;
  kind: "run" | "step" | "console" | "network";
  message: string;
  count: number;
  affectedRunCount: number;
  lastSeenAt: string;
  lastRunId: string | null;
  statusCode: number | null;
}

export interface RecentIssueItem {
  id: string;
  type: "run_failure" | "regression" | "suite_failure" | "schedule_failure" | "notification_failure";
  severity: "warning" | "error";
  title: string;
  occurredAt: string;
  detail: string;
  href: string;
}

export interface AnalyticsListResponse<T> {
  items: T[];
  generatedAt: string;
}
