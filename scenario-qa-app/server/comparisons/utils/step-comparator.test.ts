import { describe, expect, it } from "vitest";
import { comparisonConfig } from "../test-fixtures.js";
import type { ComparableStep } from "../types/test-run-comparison.js";
import { compareStepMatch } from "./step-comparator.js";

describe("step-comparator", () => {
  it("target, expected, actual, URL, 오류와 스크린샷 메타데이터 변화를 감지한다", () => {
    const baseline = step("login-submit", "success", "/login", null, null);
    const comparison = step(
      "changed-submit",
      "failed",
      "/login?token=secret",
      "요소 0개 password=secret",
      "artifact-1"
    );
    const result = compareStepMatch(
      {
        baseline,
        comparison,
        matchType: "step_id",
        confidence: 1
      },
      0,
      comparisonConfig
    );
    expect(result).toMatchObject({
      changeType: "regression",
      targetChanged: true,
      expectedChanged: true,
      actualChanged: true,
      urlChanged: true,
      errorMessageChanged: true,
      baselineScreenshotAvailable: false,
      comparisonScreenshotAvailable: true
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

function step(
  target: string,
  status: "success" | "failed",
  currentUrl: string,
  errorMessage: string | null,
  screenshotArtifactId: string | null
): ComparableStep {
  return {
    order: 1,
    definition: {
      id: "step-submit",
      order: 1,
      name: "로그인 제출",
      action: "click",
      target: { strategy: "testId", value: target },
      timeout: 1000,
      required: true
    },
    result: {
      stepId: "step-submit",
      stepName: "로그인 제출",
      action: "click",
      status,
      startedAt: "2026-08-03T00:00:00.000Z",
      finishedAt: "2026-08-03T00:00:01.000Z",
      durationMs: 1000,
      expected: { target },
      actual: { target, timestamp: "2026-08-03T00:00:00.000Z" },
      errorMessage,
      screenshotArtifactId,
      currentUrl: `https://example.com${currentUrl}`
    }
  };
}
