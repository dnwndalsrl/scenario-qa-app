import { describe, expect, it } from "vitest";
import type { AutomatedTestRun } from "../../shared/types/analysis";
import { buildTestRunTimeline } from "../../shared/utils/test-run-timeline";

function run(stepResults: AutomatedTestRun["stepResults"], durationMs?: number): AutomatedTestRun {
  return {
    id: "run-1", analysisId: "analysis-1", scenarioId: "test-1", status: "failed", stepResults,
    consoleIssues: [], networkIssues: [], screenshotArtifactIds: [], durationMs
  };
}

describe("buildTestRunTimeline", () => {
  it("orders steps and identifies the first failed step", () => {
    const timeline = buildTestRunTimeline(run([
      { stepId: "step-2", order: 2, action: "assert_url", description: "URL 확인", status: "failed", expected: "url-prefix:https://example.com/about", actual: "https://example.com/", durationMs: 1200 },
      { stepId: "step-1", order: 1, action: "click", description: "링크 클릭", status: "success", durationMs: 450 }
    ]));

    expect(timeline.items.map((step) => step.stepId)).toEqual(["step-1", "step-2"]);
    expect(timeline).toMatchObject({ successCount: 1, attentionCount: 1, firstAttentionOrder: 2, displayDuration: "1.6초" });
    expect(timeline.items[1]).toMatchObject({ displayExpected: "https://example.com/about", displayActual: "https://example.com/", displayDuration: "1.2초", needsAttention: true });
  });

  it("provides readable actual-result fallbacks without inventing evidence", () => {
    const timeline = buildTestRunTimeline(run([
      { stepId: "step-1", order: 1, action: "wait_for_stable", description: "안정화", status: "success" },
      { stepId: "step-2", order: 2, action: "click", description: "클릭", status: "blocked", errorMessage: "선행 단계 실패" }
    ], 800));

    expect(timeline.items[0]?.displayActual).toBe("단계가 정상적으로 완료되었습니다.");
    expect(timeline.items[1]?.displayActual).toBe("선행 단계 실패");
    expect(timeline.displayDuration).toBe("800ms");
  });
});
