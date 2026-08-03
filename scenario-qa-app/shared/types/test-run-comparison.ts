import type { JsonValue, TestRunStatus } from "./test-run.js";

export const TEST_RUN_COMPARISON_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed"
] as const;

export type TestRunComparisonStatus =
  (typeof TEST_RUN_COMPARISON_STATUSES)[number];

export type RunChangeType =
  | "regression"
  | "resolved"
  | "persistent_failure"
  | "unchanged_success"
  | "status_changed"
  | "structural_change";

export type StepChangeType =
  | "regression"
  | "resolved"
  | "persistent_failure"
  | "unchanged_success"
  | "status_changed"
  | "added"
  | "removed";

export type StepMatchType =
  | "step_id"
  | "order_action"
  | "name_action"
  | "target_action"
  | "unmatched";

export type PerformanceChange =
  | "improved"
  | "stable"
  | "degraded"
  | "critical_degraded";

export interface StepComparisonDetail {
  field: "target" | "expected" | "actual" | "url" | "error_message";
  label: string;
  changed: boolean;
  baselineValue?: JsonValue;
  comparisonValue?: JsonValue;
}

export interface StepComparison {
  id: string;
  baselineStepId?: string;
  comparisonStepId?: string;
  baselineOrder?: number;
  comparisonOrder?: number;
  baselineName?: string;
  comparisonName?: string;
  baselineAction?: string;
  comparisonAction?: string;
  matchType: StepMatchType;
  matchConfidence: number;
  changeType: StepChangeType;
  baselineStatus?: string;
  comparisonStatus?: string;
  durationDifferenceMs?: number;
  durationChangeRate?: number;
  performanceChange?: PerformanceChange;
  expectedChanged: boolean;
  actualChanged: boolean;
  urlChanged: boolean;
  errorMessageChanged: boolean;
  targetChanged: boolean;
  baselineScreenshotAvailable: boolean;
  comparisonScreenshotAvailable: boolean;
  details: StepComparisonDetail[];
}

export interface ConsoleErrorComparison {
  fingerprint: string;
  changeType: "new" | "resolved" | "persistent";
  type: string;
  baselineCount: number;
  comparisonCount: number;
  baselineMessage?: string;
  comparisonMessage?: string;
  relatedStepId?: string;
}

export interface NetworkErrorComparison {
  fingerprint: string;
  changeType: "new" | "resolved" | "persistent" | "status_changed";
  method: string;
  normalizedUrl: string;
  baselineStatus?: number | null;
  comparisonStatus?: number | null;
  resourceType: string;
  failureText?: string | null;
  baselineCount: number;
  comparisonCount: number;
  relatedStepId?: string;
}

export interface NetworkStatusChange {
  method: string;
  normalizedUrl: string;
  baselineStatus?: number | null;
  comparisonStatus?: number | null;
  changeType:
    | "regression"
    | "resolved"
    | "status_changed"
    | "new_failure"
    | "removed_failure";
}

export interface UrlComparisonResult {
  changed: boolean;
  baselineUrl?: string;
  comparisonUrl?: string;
  originChanged: boolean;
  pathnameChanged: boolean;
  queryChanged: boolean;
  hashChanged: boolean;
}

export interface PerformanceMeasurement {
  baselineDurationMs?: number;
  comparisonDurationMs?: number;
  differenceMs?: number;
  changeRate?: number;
  change: PerformanceChange;
}

export interface PerformanceComparison extends PerformanceMeasurement {
  warningRate: number;
  criticalRate: number;
  minimumDifferenceMs: number;
  criticalDifferenceMs: number;
}

export interface TestRunComparisonSummary {
  totalBaselineSteps: number;
  totalComparisonSteps: number;
  matchedSteps: number;
  addedSteps: number;
  removedSteps: number;
  regressionCount: number;
  resolvedCount: number;
  persistentFailureCount: number;
  unchangedSuccessCount: number;
  newConsoleErrorCount: number;
  resolvedConsoleErrorCount: number;
  newNetworkErrorCount: number;
  resolvedNetworkErrorCount: number;
  networkStatusChangeCount: number;
  degradedStepCount: number;
  improvedStepCount: number;
  overallDurationDifferenceMs?: number;
  overallDurationChangeRate?: number;
}

export interface TestRunComparison {
  id: string;
  projectId: string;
  scenarioId: string;
  baselineRunId: string;
  comparisonRunId: string;
  algorithmVersion: string;
  status: TestRunComparisonStatus;
  baselineRunStatus?: TestRunStatus;
  comparisonRunStatus?: TestRunStatus;
  baselineCreatedAt?: string;
  comparisonCreatedAt?: string;
  runChangeType?: RunChangeType;
  summary?: TestRunComparisonSummary;
  stepComparisons?: StepComparison[];
  consoleComparisons?: ConsoleErrorComparison[];
  networkComparisons?: NetworkErrorComparison[];
  networkStatusChanges?: NetworkStatusChange[];
  performanceComparison?: PerformanceComparison;
  limitations?: string[];
  aiSummaryId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TestRunComparisonRequest {
  baselineRunId: string;
  comparisonRunId: string;
}

export interface TestRunComparisonAccepted {
  comparisonId: string;
  status: TestRunComparisonStatus;
  reused: boolean;
}

export const TEST_RUN_COMPARISON_ERROR_CODES = {
  BASELINE_RUN_NOT_FOUND: "BASELINE_RUN_NOT_FOUND",
  COMPARISON_RUN_NOT_FOUND: "COMPARISON_RUN_NOT_FOUND",
  RUN_COMPARISON_NOT_ALLOWED: "RUN_COMPARISON_NOT_ALLOWED",
  RUNS_MUST_BE_DIFFERENT: "RUNS_MUST_BE_DIFFERENT",
  RUNS_PROJECT_MISMATCH: "RUNS_PROJECT_MISMATCH",
  RUNS_SCENARIO_MISMATCH: "RUNS_SCENARIO_MISMATCH",
  RUN_NOT_COMPLETED: "RUN_NOT_COMPLETED",
  RUN_RESULT_NOT_FOUND: "RUN_RESULT_NOT_FOUND",
  RUN_COMPARISON_IN_PROGRESS: "RUN_COMPARISON_IN_PROGRESS",
  RUN_COMPARISON_ALREADY_EXISTS: "RUN_COMPARISON_ALREADY_EXISTS",
  RUN_COMPARISON_NOT_FOUND: "RUN_COMPARISON_NOT_FOUND",
  STEP_MATCHING_FAILED: "STEP_MATCHING_FAILED",
  RUN_COMPARISON_FAILED: "RUN_COMPARISON_FAILED"
} as const;
