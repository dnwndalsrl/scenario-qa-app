import { describe, expect, it } from "vitest";
import type { AutomatedTestRun } from "../../shared/types/analysis";
import { recommendTestRunReview } from "../../shared/utils/test-run-review-recommendation";

function run(overrides: Partial<AutomatedTestRun> = {}): AutomatedTestRun {
  return { id: "run-1", analysisId: "analysis-1", scenarioId: "test-1", status: "failed", stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: [], ...overrides };
}

describe("test run review recommendation", () => {
  it("제품 결함 자동 판정을 실제 결함으로 추천한다", () => {
    expect(recommendTestRunReview(run({ failureKind: "product_defect" }))).toMatchObject({ classification: "actual_defect", confidence: "high" });
  });

  it("요소 탐색 실패를 대상 요소 인식 오류로 추천한다", () => {
    expect(recommendTestRunReview(run({ error: { code: "ELEMENT_NOT_FOUND", message: "테스트 대상 요소를 찾지 못했습니다." } }))).toMatchObject({ classification: "element_recognition_error", confidence: "medium" });
  });

  it("워크플로와 네트워크 실패를 환경 문제로 추천한다", () => {
    expect(recommendTestRunReview(run({ status: "error", error: { code: "WORKFLOW_FAILED", message: "실행기 연결 실패" } }))).toMatchObject({ classification: "environment_issue" });
  });

  it("근거가 모호하면 사용자 확인을 유지한다", () => {
    expect(recommendTestRunReview(run())).toMatchObject({ classification: "pending_review", confidence: "low" });
  });
});
