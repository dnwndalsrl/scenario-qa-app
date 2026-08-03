import type { RunChangeType } from "../../../shared/types/test-run-comparison.js";

const FAILURE_STATUSES = new Set(["failed", "error"]);

export function compareRunStatus(
  baselineStatus: string,
  comparisonStatus: string,
  hasStructuralChange = false
): RunChangeType {
  if (hasStructuralChange) {
    return "structural_change";
  }
  if (baselineStatus === "success" && FAILURE_STATUSES.has(comparisonStatus)) {
    return "regression";
  }
  if (FAILURE_STATUSES.has(baselineStatus) && comparisonStatus === "success") {
    return "resolved";
  }
  if (
    FAILURE_STATUSES.has(baselineStatus) &&
    FAILURE_STATUSES.has(comparisonStatus)
  ) {
    return "persistent_failure";
  }
  if (baselineStatus === "success" && comparisonStatus === "success") {
    return "unchanged_success";
  }
  return "status_changed";
}

export function compareStepStatus(
  baselineStatus: string,
  comparisonStatus: string
): Exclude<RunChangeType, "structural_change"> {
  return compareRunStatus(baselineStatus, comparisonStatus, false) as Exclude<
    RunChangeType,
    "structural_change"
  >;
}
