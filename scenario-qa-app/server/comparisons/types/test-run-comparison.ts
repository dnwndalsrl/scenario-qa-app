import type { TestStep } from "../../../shared/types/scenario.js";
import type {
  RunResult,
  RunStepResult,
  TestRun
} from "../../../shared/types/test-run.js";
import type { PerformanceChange } from "../../../shared/types/test-run-comparison.js";

export interface ComparisonConfig {
  algorithmVersion: string;
  durationWarningRate: number;
  durationCriticalRate: number;
  durationMinDifferenceMs: number;
  durationCriticalDifferenceMs: number;
  stepMatchMinConfidence: number;
  maxConsoleItems: number;
  maxNetworkItems: number;
}

export interface ComparableStep {
  result: RunStepResult;
  order: number;
  definition?: TestStep;
}

export interface RunComparisonInput {
  baselineRun: TestRun;
  comparisonRun: TestRun;
  baselineResult: RunResult;
  comparisonResult: RunResult;
  baselineSteps: ComparableStep[];
  comparisonSteps: ComparableStep[];
}

export interface DurationComparisonResult {
  baselineDurationMs?: number;
  comparisonDurationMs?: number;
  differenceMs?: number;
  changeRate?: number;
  change: PerformanceChange;
}

export interface StepMatch {
  baseline?: ComparableStep;
  comparison?: ComparableStep;
  matchType:
    | "step_id"
    | "order_action"
    | "name_action"
    | "target_action"
    | "unmatched";
  confidence: number;
}
