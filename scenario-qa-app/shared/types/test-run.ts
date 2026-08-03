import type { TestAction } from "./scenario.js";

export const TEST_RUN_STATUSES = [
  "pending",
  "running",
  "success",
  "failed",
  "blocked",
  "error"
] as const;

export type TestRunStatus = (typeof TEST_RUN_STATUSES)[number];
export type CompletedRunStatus = Exclude<
  TestRunStatus,
  "pending" | "running"
>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface TestRun {
  id: string;
  projectId: string;
  scenarioId: string;
  status: TestRunStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  totalSteps: number;
  successCount: number;
  failedCount: number;
  blockedCount: number;
  errorCount: number;
  errorCode?: string;
  errorMessage?: string;
  scenarioUpdatedAt?: string;
  createdAt: string;
}

export interface RunStepResult {
  stepId: string;
  stepName: string;
  action: TestAction;
  status: Exclude<TestRunStatus, "pending" | "running">;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  expected: JsonValue;
  actual: JsonValue;
  errorMessage: string | null;
  screenshotArtifactId: string | null;
  currentUrl: string;
}

export interface ConsoleLogEntry {
  type: string;
  text: string;
  timestamp: string;
}

export interface NetworkErrorEntry {
  url: string;
  method: string;
  status: number | null;
  failureText: string | null;
  resourceType: string;
  timestamp: string;
}

export interface RunResult {
  scenarioId: string;
  scenarioName: string;
  status: CompletedRunStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totalSteps: number;
  successCount: number;
  failedCount: number;
  blockedCount: number;
  errorCount: number;
  steps: RunStepResult[];
  consoleLogs: ConsoleLogEntry[];
  networkErrors: NetworkErrorEntry[];
  browserInfo?: {
    name: "chromium";
    version: string;
    viewport: { width: number; height: number };
    headless: boolean;
  };
}

export interface TestRunDetail {
  run: TestRun;
  result: RunResult | null;
}

export interface TestRunRequest {
  projectId: string;
  scenarioId: string;
}

export interface TestRunAccepted {
  runId: string;
  status: "pending";
}
