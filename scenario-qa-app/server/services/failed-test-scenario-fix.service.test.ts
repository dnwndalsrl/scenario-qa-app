import { describe, expect, it } from "vitest";
import type { AutomatedTestRun } from "../../shared/types/analysis";
import { buildFailureFixContext } from "./failed-test-scenario-fix.service";

function failedRun(): AutomatedTestRun {
  return {
    id: "run-1", analysisId: "analysis-1", scenarioId: "test-1", status: "failed", failureKind: "automation_limit", scenarioRevision: 2,
    stepResults: [
      { stepId: "step-1", order: 1, action: "click", description: "메뉴 클릭", status: "success", actual: "클릭됨" },
      { stepId: "step-2", order: 2, action: "assert_visible", description: "메뉴 표시", status: "failed", expected: "표시", actual: "숨김", errorMessage: "대상 요소를 찾지 못했습니다.", failureKind: "automation_limit" }
    ],
    consoleIssues: Array.from({ length: 7 }, (_, index) => ({ id: `console-${index}`, type: "error" as const, text: `콘솔 오류 ${index}`, recordedAt: "2026-08-24T00:00:00.000Z" })),
    networkIssues: Array.from({ length: 7 }, (_, index) => ({ id: `network-${index}`, url: `https://example.com/${index}`, method: "GET", resourceType: "fetch", status: 500, recordedAt: "2026-08-24T00:00:00.000Z" })),
    screenshotArtifactIds: ["artifact-1"], error: { code: "ELEMENT_NOT_FOUND", message: "요소 확인 실패" }
  };
}

describe("failed test scenario fix", () => {
  it("keeps only failed-step evidence and bounded diagnostics", () => {
    const context = buildFailureFixContext(failedRun());
    expect(context).toMatchObject({ status: "failed", failureKind: "automation_limit", scenarioRevision: 2, error: { code: "ELEMENT_NOT_FOUND" } });
    expect(context.failedSteps).toEqual([{ order: 2, action: "assert_visible", description: "메뉴 표시", expected: "표시", actual: "숨김", errorMessage: "대상 요소를 찾지 못했습니다.", failureKind: "automation_limit" }]);
    expect(context.consoleIssues).toHaveLength(5);
    expect(context.networkIssues).toHaveLength(5);
    expect(context.screenshotArtifactIds).toEqual(["artifact-1"]);
  });

  it("rejects a successful run because it has no failure to improve", () => {
    expect(() => buildFailureFixContext({ ...failedRun(), status: "success", failureKind: undefined, error: undefined, stepResults: [] })).toThrow("실패한 최근 실행");
  });
});
