import { describe, expect, it } from "vitest";
import { shouldStopSuiteExecution } from "./execution-policy.js";

describe("suite execution policy", () => {
  it("continue_on_failure는 실패와 오류 후에도 계속한다", () => {
    expect(shouldStopSuiteExecution("continue_on_failure", "failed")).toBe(false);
    expect(shouldStopSuiteExecution("continue_on_failure", "error")).toBe(false);
  });

  it("stop_on_failure는 실패와 오류에서 중단한다", () => {
    expect(shouldStopSuiteExecution("stop_on_failure", "failed")).toBe(true);
    expect(shouldStopSuiteExecution("stop_on_failure", "error")).toBe(true);
    expect(shouldStopSuiteExecution("stop_on_failure", "success")).toBe(false);
  });

  it("stop_on_error는 오류에서만 중단한다", () => {
    expect(shouldStopSuiteExecution("stop_on_error", "failed")).toBe(false);
    expect(shouldStopSuiteExecution("stop_on_error", "error")).toBe(true);
  });
});
