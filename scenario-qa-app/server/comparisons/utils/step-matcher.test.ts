import { describe, expect, it } from "vitest";
import type { ComparableStep } from "../types/test-run-comparison.js";
import { matchSteps } from "./step-matcher.js";

describe("step-matcher", () => {
  it("stepId를 가장 먼저 매칭한다", () => {
    expect(matchSteps([step("same", 1, "click", "기준")], [step("same", 8, "click", "변경")], 0.8)[0]).toMatchObject({
      matchType: "step_id",
      confidence: 1
    });
  });

  it("ID가 다르면 order와 action, 그 다음 이름과 action으로 매칭한다", () => {
    expect(matchSteps([step("a", 1, "click", "버튼")], [step("b", 1, "click", "다름")], 0.8)[0]?.matchType).toBe("order_action");
    expect(matchSteps([step("a", 1, "click", " 로그인   버튼 ")], [step("b", 2, "click", "로그인 버튼")], 0.8)[0]?.matchType).toBe("name_action");
  });

  it("낮은 신뢰도 target 매칭을 거부한다", () => {
    const baseline = step("a", 1, "click", "A", "submit");
    const comparison = step("b", 2, "click", "B", "submit");
    const matches = matchSteps([baseline], [comparison], 0.9);
    expect(matches).toHaveLength(2);
    expect(matches.every((match) => match.matchType === "unmatched")).toBe(true);
  });

  it("매칭되지 않은 단계를 삭제와 추가 후보로 남긴다", () => {
    const matches = matchSteps(
      [step("old", 1, "click", "삭제")],
      [step("new", 2, "goto", "추가")],
      0.8
    );
    expect(matches.filter((match) => match.baseline && !match.comparison)).toHaveLength(1);
    expect(matches.filter((match) => !match.baseline && match.comparison)).toHaveLength(1);
  });
});

function step(
  id: string,
  order: number,
  action: "click" | "goto",
  name: string,
  target?: string
): ComparableStep {
  return {
    order,
    definition: {
      id,
      order,
      name,
      action,
      ...(target === undefined ? {} : { target: { strategy: "testId", value: target } }),
      timeout: 1000,
      required: true
    },
    result: {
      stepId: id,
      stepName: name,
      action,
      status: "success",
      startedAt: "2026-08-03T00:00:00.000Z",
      finishedAt: "2026-08-03T00:00:00.001Z",
      durationMs: 1,
      expected: {},
      actual: {},
      errorMessage: null,
      screenshotArtifactId: null,
      currentUrl: "https://example.com"
    }
  };
}
