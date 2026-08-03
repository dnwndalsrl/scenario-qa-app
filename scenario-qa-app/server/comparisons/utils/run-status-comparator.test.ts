import { describe, expect, it } from "vitest";
import { compareRunStatus, compareStepStatus } from "./run-status-comparator.js";

describe("run-status-comparator", () => {
  it.each([
    ["success", "failed", "regression"],
    ["success", "error", "regression"],
    ["failed", "success", "resolved"],
    ["failed", "error", "persistent_failure"],
    ["success", "success", "unchanged_success"],
    ["blocked", "failed", "status_changed"]
  ])("%s → %s를 %s로 판정한다", (baseline, comparison, expected) => {
    expect(compareRunStatus(baseline, comparison)).toBe(expected);
  });

  it("구조 변경을 전체 상태보다 우선 표시한다", () => {
    expect(compareRunStatus("success", "failed", true)).toBe("structural_change");
  });

  it("단계 상태도 회귀와 해결을 같은 기준으로 판정한다", () => {
    expect(compareStepStatus("success", "failed")).toBe("regression");
    expect(compareStepStatus("error", "success")).toBe("resolved");
  });
});
