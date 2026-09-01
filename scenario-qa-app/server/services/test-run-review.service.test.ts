import { describe, expect, it } from "vitest";
import type { AutomatedTestRun } from "../../shared/types/analysis";
import { applyTestRunReview, testRunReviewSchema } from "./test-run-review.service";

const failedRun = (): AutomatedTestRun => ({
  id: "run-1", analysisId: "analysis-1", scenarioId: "test-1", status: "failed",
  stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: []
});

describe("test run review", () => {
  it("stores a user classification separately from the automated failure result", () => {
    const reviewed = applyTestRunReview(failedRun(), { classification: "scenario_error", note: "예상 URL 대신 섹션 표시를 확인해야 합니다." }, "2026-08-28T00:00:00.000Z");
    expect(reviewed.status).toBe("failed");
    expect(reviewed.review).toEqual({ classification: "scenario_error", note: "예상 URL 대신 섹션 표시를 확인해야 합니다.", reviewedAt: "2026-08-28T00:00:00.000Z" });
  });

  it("rejects successful runs and overlong notes", () => {
    expect(() => applyTestRunReview({ ...failedRun(), status: "success" }, { classification: "actual_defect", note: "" })).toThrow("실패하거나 확인이 필요한");
    expect(testRunReviewSchema.safeParse({ classification: "actual_defect", note: "a".repeat(1001) }).success).toBe(false);
  });

  it("links a created defect and preserves the link when the classification is corrected", () => {
    const linked = applyTestRunReview(failedRun(), { classification: "actual_defect", note: "재현됨" }, "2026-08-28T00:00:00.000Z", "defect-1");
    const corrected = applyTestRunReview(linked, { classification: "environment_issue", note: "환경 문제로 정정" }, "2026-08-28T01:00:00.000Z");
    expect(linked.review?.defectId).toBe("defect-1");
    expect(corrected.review?.defectId).toBe("defect-1");
  });
});
