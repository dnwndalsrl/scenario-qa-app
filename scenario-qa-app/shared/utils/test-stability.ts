import type { AutomatedTestRun, TestFailureKind, TestRunStatus } from "../types/analysis";

export type TestStabilityStatus = "insufficient_data" | "stable" | "flaky" | "consistently_failing" | "environment_affected";
export interface TestStabilitySummary {
  status: TestStabilityStatus; executionCount: number; observationCount: number; successCount: number;
  productDefectCount: number; environmentErrorCount: number; recoveredCount: number; successRate: number;
}

const terminal = new Set<TestRunStatus>(["success", "failed", "blocked", "error"]);
const environmentKinds = new Set<TestFailureKind>(["automation_limit", "environment_error", "inconclusive"]);

function runTime(run: AutomatedTestRun): number {
  const parsed = Date.parse(run.completedAt || run.startedAt || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function testStabilitySummary(scenarioId: string, runs: AutomatedTestRun[], limit = 5): TestStabilitySummary {
  const selected = runs.filter((run) => run.scenarioId === scenarioId && terminal.has(run.status))
    .sort((left, right) => runTime(right) - runTime(left)).slice(0, limit);
  const observations: Array<{ status: TestRunStatus; failureKind?: TestFailureKind }> = [];
  for (const run of selected) {
    if (run.revalidation) observations.push({ status: run.revalidation.originalStatus, failureKind: run.revalidation.originalFailureKind });
    observations.push({ status: run.status, failureKind: run.failureKind });
  }

  const successCount = observations.filter((item) => item.status === "success").length;
  const productDefectCount = observations.filter((item) => item.status === "failed" && (!item.failureKind || item.failureKind === "product_defect")).length;
  const environmentErrorCount = observations.filter((item) => item.status === "error" || environmentKinds.has(item.failureKind as TestFailureKind)).length;
  const recoveredCount = selected.filter((run) => run.revalidation?.recovered).length;
  const observationCount = observations.length;
  const successRate = observationCount ? Math.round((successCount / observationCount) * 100) : 0;
  const nonSuccessCount = observationCount - successCount;

  let status: TestStabilityStatus = "insufficient_data";
  if (recoveredCount || (successCount > 0 && nonSuccessCount > 0)) status = "flaky";
  else if (selected.length >= 3 && successCount === observationCount) status = "stable";
  else if (selected.length >= 3 && productDefectCount >= 3 && successCount === 0) status = "consistently_failing";
  else if (selected.length >= 2 && environmentErrorCount > 0 && productDefectCount === 0 && successCount === 0) status = "environment_affected";

  return { status, executionCount: selected.length, observationCount, successCount, productDefectCount, environmentErrorCount, recoveredCount, successRate };
}

export function testStabilityLabel(status: TestStabilityStatus): string {
  return {
    insufficient_data: "데이터 부족", stable: "안정", flaky: "불안정",
    consistently_failing: "지속 실패", environment_affected: "환경 영향"
  }[status];
}
