import type {
  TestSuiteRunItem,
  TestSuiteRunStatus
} from "../../../shared/types/test-suite.js";

const COMPLETED_EXECUTABLE = new Set([
  "success",
  "failed",
  "blocked",
  "error"
]);

export interface SuiteRunAggregate {
  completedItems: number;
  successCount: number;
  failedCount: number;
  blockedCount: number;
  skippedCount: number;
  errorCount: number;
  progressRate: number;
}

export function aggregateSuiteRunItems(
  items: TestSuiteRunItem[],
  executableItems: number
): SuiteRunAggregate {
  const count = (status: TestSuiteRunItem["status"]): number =>
    items.filter((item) => item.status === status).length;
  const completedItems = items.filter((item) =>
    COMPLETED_EXECUTABLE.has(item.status)
  ).length;
  return {
    completedItems,
    successCount: count("success"),
    failedCount: count("failed"),
    blockedCount: count("blocked"),
    skippedCount: count("skipped"),
    errorCount: count("error"),
    progressRate:
      executableItems === 0
        ? 0
        : Math.min(100, Math.round((completedItems / executableItems) * 100))
  };
}

export function determineSuiteRunStatus(
  aggregate: SuiteRunAggregate,
  executableItems: number
): TestSuiteRunStatus {
  if (executableItems === 0) {
    return "blocked";
  }
  const hasProblem =
    aggregate.failedCount > 0 ||
    aggregate.errorCount > 0 ||
    aggregate.blockedCount > 0;
  if (aggregate.successCount > 0 && hasProblem) {
    return "partial_success";
  }
  if (hasProblem) {
    return "failed";
  }
  return aggregate.successCount === executableItems ? "success" : "error";
}
