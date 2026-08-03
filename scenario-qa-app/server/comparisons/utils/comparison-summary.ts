import type {
  ConsoleErrorComparison,
  NetworkErrorComparison,
  PerformanceComparison,
  StepComparison,
  TestRunComparisonSummary
} from "../../../shared/types/test-run-comparison.js";

export function createComparisonSummary(input: {
  totalBaselineSteps: number;
  totalComparisonSteps: number;
  steps: StepComparison[];
  console: ConsoleErrorComparison[];
  network: NetworkErrorComparison[];
  performance: PerformanceComparison;
}): TestRunComparisonSummary {
  return {
    totalBaselineSteps: input.totalBaselineSteps,
    totalComparisonSteps: input.totalComparisonSteps,
    matchedSteps: input.steps.filter((step) => step.matchType !== "unmatched").length,
    addedSteps: count(input.steps, "added"),
    removedSteps: count(input.steps, "removed"),
    regressionCount: count(input.steps, "regression"),
    resolvedCount: count(input.steps, "resolved"),
    persistentFailureCount: count(input.steps, "persistent_failure"),
    unchangedSuccessCount: count(input.steps, "unchanged_success"),
    newConsoleErrorCount: input.console.filter((item) => item.changeType === "new").length,
    resolvedConsoleErrorCount: input.console.filter((item) => item.changeType === "resolved").length,
    newNetworkErrorCount: input.network.filter(
      (item) => item.changeType === "new" || item.changeType === "status_changed"
    ).length,
    resolvedNetworkErrorCount: input.network.filter((item) => item.changeType === "resolved").length,
    networkStatusChangeCount: input.network.filter((item) => item.changeType === "status_changed").length,
    degradedStepCount: input.steps.filter(
      (step) => step.performanceChange === "degraded" || step.performanceChange === "critical_degraded"
    ).length,
    improvedStepCount: input.steps.filter((step) => step.performanceChange === "improved").length,
    ...(input.performance.differenceMs === undefined
      ? {}
      : { overallDurationDifferenceMs: input.performance.differenceMs }),
    ...(input.performance.changeRate === undefined
      ? {}
      : { overallDurationChangeRate: input.performance.changeRate })
  };
}

function count(
  steps: StepComparison[],
  changeType: StepComparison["changeType"]
): number {
  return steps.filter((step) => step.changeType === changeType).length;
}
