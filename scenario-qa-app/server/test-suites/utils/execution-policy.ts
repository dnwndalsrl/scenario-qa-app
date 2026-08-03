import type {
  SuiteExecutionPolicy,
  TestSuiteRunItemStatus
} from "../../../shared/types/test-suite.js";

export function shouldStopSuiteExecution(
  policy: SuiteExecutionPolicy,
  status: TestSuiteRunItemStatus
): boolean {
  if (policy === "continue_on_failure") {
    return false;
  }
  if (policy === "stop_on_error") {
    return status === "error";
  }
  return status === "failed" || status === "error";
}
