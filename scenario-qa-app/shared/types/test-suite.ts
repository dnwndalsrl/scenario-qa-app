import type { TestScenario } from "./scenario.js";

export const SUITE_EXECUTION_POLICIES = [
  "continue_on_failure",
  "stop_on_failure",
  "stop_on_error"
] as const;

export type SuiteExecutionPolicy =
  (typeof SUITE_EXECUTION_POLICIES)[number];
export type TestSuiteStatus = "active" | "inactive";
export type TestSuiteRunStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "partial_success"
  | "blocked"
  | "cancelled"
  | "error";
export type TestSuiteRunItemStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "blocked"
  | "skipped"
  | "error";

export type TestSuiteRunTrigger =
  | "manual"
  | "schedule"
  | "retry"
  | "schedule_manual_trigger";

export interface ScheduleTriggerInfo {
  scheduleId: string;
  scheduleExecutionId: string;
  scheduledFor: string;
}

export interface TestSuiteItem {
  id: string;
  suiteId: string;
  scenarioId: string;
  order: number;
  enabled: boolean;
  required: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TestSuite {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  status: TestSuiteStatus;
  executionPolicy: SuiteExecutionPolicy;
  defaultTimeout?: number;
  items: TestSuiteItem[];
  createdAt: string;
  updatedAt: string;
}

export interface TestSuiteItemInput {
  scenarioId: string;
  order: number;
  enabled: boolean;
  required: boolean;
}

export interface TestSuiteInput {
  name: string;
  description?: string;
  status: TestSuiteStatus;
  executionPolicy: SuiteExecutionPolicy;
  defaultTimeout?: number;
  items: TestSuiteItemInput[];
}

export interface MissingEnvironmentVariable {
  name: string;
  scenarioIds: string[];
}

export interface TestSuiteResolvedItem extends TestSuiteItem {
  scenarioName: string | null;
  scenarioExists: boolean;
}

export interface TestSuiteSummary extends TestSuite {
  executableItems: number;
  invalidScenarioCount: number;
  recentRunStatus: TestSuiteRunStatus | null;
  recentRunAt: string | null;
}

export interface TestSuiteDetail {
  suite: TestSuite;
  items: TestSuiteResolvedItem[];
  missingScenarioIds: string[];
  missingEnvironmentVariables: MissingEnvironmentVariable[];
  recentRun: TestSuiteRun | null;
}

export interface TestSuiteRunItemSnapshot {
  suiteItemId: string;
  scenarioId: string;
  scenarioName: string;
  order: number;
  enabled: boolean;
  required: boolean;
  scenarioSnapshot: TestScenario;
}

export interface TestSuiteRunSnapshot {
  suiteName: string;
  suiteDescription?: string;
  executionPolicy: SuiteExecutionPolicy;
  defaultTimeout?: number;
  items: TestSuiteRunItemSnapshot[];
  createdAt: string;
}

export interface TestSuiteRun {
  id: string;
  suiteId: string;
  projectId: string;
  status: TestSuiteRunStatus;
  executionPolicy: SuiteExecutionPolicy;
  trigger?: TestSuiteRunTrigger;
  scheduleTriggerInfo?: ScheduleTriggerInfo;
  suiteSnapshot: TestSuiteRunSnapshot;
  currentItemOrder?: number;
  totalItems: number;
  executableItems: number;
  completedItems: number;
  successCount: number;
  failedCount: number;
  blockedCount: number;
  skippedCount: number;
  errorCount: number;
  progressRate: number;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestSuiteRunItem {
  id: string;
  suiteRunId: string;
  suiteItemId: string;
  scenarioId: string;
  scenarioName: string;
  order: number;
  status: TestSuiteRunItemStatus;
  required: boolean;
  testRunId?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  blockedReason?: string;
  causedByScenarioId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestSuiteRunDetail {
  run: TestSuiteRun;
  items: TestSuiteRunItem[];
}

export interface TestSuiteRunRequest {
  projectId: string;
  suiteId: string;
  trigger?: TestSuiteRunTrigger;
  scheduleTriggerInfo?: ScheduleTriggerInfo;
}

export interface TestSuiteRunAccepted {
  suiteRunId: string;
  status: "pending";
}
