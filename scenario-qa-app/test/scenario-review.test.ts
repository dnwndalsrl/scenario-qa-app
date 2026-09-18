import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GeneratedTestScenario } from "../shared/types/analysis";
import { isScenarioIncluded, isScenarioReviewEligible } from "../shared/utils/scenario-review";

const reviewView = readFileSync(new URL("../components/analysis/ScenarioReviewView.vue", import.meta.url), "utf8");
const detailPage = readFileSync(new URL("../pages/analyses/[analysisId].vue", import.meta.url), "utf8");
const runApi = readFileSync(new URL("../server/api/analyses/[analysisId]/run.post.ts", import.meta.url), "utf8");
const preflightApi = readFileSync(new URL("../server/api/analyses/[analysisId]/preflight.get.ts", import.meta.url), "utf8");

function scenario(overrides: Partial<GeneratedTestScenario> = {}): GeneratedTestScenario {
  return {
    id: "test-1", analysisId: "analysis-1", title: "링크 이동", description: "", purpose: "",
    category: "navigation", safetyLevel: "safe", safetyReasons: [], confidence: 0.9, autoExecutable: true,
    sourceElementIds: [], generatedAt: "2026-09-18T00:00:00.000Z",
    steps: [{ id: "step-1", order: 1, action: "assert_visible", description: "표시 확인", evidence: [] }],
    ...overrides
  };
}

describe("시나리오 확정 선택", () => {
  it("기존 시나리오는 기본 포함한다", () => {
    expect(isScenarioIncluded(scenario())).toBe(true);
    expect(isScenarioReviewEligible(scenario())).toBe(true);
  });

  it("사용자가 제외한 시나리오는 실행 대상에서 뺀다", () => {
    expect(isScenarioReviewEligible(scenario({ reviewDisposition: "excluded" }))).toBe(false);
  });

  it("안전하지 않거나 검증 단계가 없는 시나리오는 실행 대상이 아니다", () => {
    expect(isScenarioReviewEligible(scenario({ safetyLevel: "review_required" }))).toBe(false);
    expect(isScenarioReviewEligible(scenario({ steps: [] }))).toBe(false);
  });

  it("확정 대기 단계에서 M06 전용 화면을 사용한다", () => {
    expect(detailPage).toContain("<ScenarioReviewView");
    expect(reviewView).toContain("실행 전 사전 점검");
    expect(reviewView).toContain("시나리오 확정");
    expect(reviewView).toContain("페이지 분석");
    expect(reviewView).toContain("발견 문제");
    expect(reviewView).not.toContain("PDF 다운로드");
  });

  it("사전 점검과 전체 실행 API가 저장된 선택 상태를 함께 적용한다", () => {
    expect(preflightApi).toContain("isScenarioIncluded(stored)");
    expect(runApi).toContain("isScenarioIncluded(stored)");
    expect(runApi).toContain("isScenarioReviewEligible(scenario)");
  });
});
