import type { TestAction } from "../constants/test-action.js";
import type { TestStatus } from "../constants/test-status.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

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

export interface StepResult {
  stepId: string;
  stepName: string;
  action: TestAction;
  status: TestStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  expected: JsonValue;
  actual: JsonValue;
  errorMessage: string | null;
  screenshotPath: string | null;
  currentUrl: string;
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  status: TestStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totalSteps: number;
  successCount: number;
  failedCount: number;
  blockedCount: number;
  errorCount: number;
  steps: StepResult[];
  consoleLogs: ConsoleLogEntry[];
  networkErrors: NetworkErrorEntry[];
  browserInfo: {
    name: "chromium";
    version: string;
    viewport: { width: number; height: number };
    headless: boolean;
  };
}

export interface ActionOutcome {
  expected: JsonValue;
  actual: JsonValue;
}

export interface ScenarioRunOutput {
  result: ScenarioResult;
  resultPath: string;
}
