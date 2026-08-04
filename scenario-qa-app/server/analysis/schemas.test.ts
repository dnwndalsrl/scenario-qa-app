import { describe, expect, it } from "vitest";
import { aiPageAnalysisResponseSchema, generatedTestResponseSchema } from "../../shared/schemas/analysis";
import { PAGE_ANALYSIS_SYSTEM_PROMPT } from "./prompts/page-analysis.prompt";
import { validateGeneratedTestPayload } from "./services/ai-test-generation.service";
import type { PageSnapshot } from "../../shared/types/analysis";

describe("AI 구조화 출력 검증", () => {
  const page = { pageType: "landing", pagePurpose: "소개", primaryFunctions: [], risks: [], testOpportunities: [], confidence: .8, limitations: [] };
  it("정상 페이지 분석 응답을 허용한다", () => expect(aiPageAnalysisResponseSchema.safeParse(page).success).toBe(true));
  it("허용되지 않은 page type과 confidence를 거부한다", () => { expect(aiPageAnalysisResponseSchema.safeParse({ ...page, pageType: "admin" }).success).toBe(false); expect(aiPageAnalysisResponseSchema.safeParse({ ...page, confidence: 2 }).success).toBe(false); });
  it("허용되지 않은 action과 최대 단계 수를 거부한다", () => {
    const base = { title: "테스트", description: "설명", purpose: "목적", category: "visibility", safetyLevel: "safe", confidence: .8, autoExecutable: true, sourceElementIds: ["element-1"] };
    expect(generatedTestResponseSchema.safeParse({ scenarios: [{ ...base, steps: [{ order: 1, action: "evaluate", description: "위험", evidence: [] }] }] }).success).toBe(false);
    expect(generatedTestResponseSchema.safeParse({ scenarios: [{ ...base, steps: Array.from({ length: 11 }, (_, index) => ({ order: index + 1, action: "goto", description: "이동", evidence: [] })) }] }).success).toBe(false);
  });
  it("페이지 prompt injection을 지시로 취급하지 않는 정책을 고정한다", () => { expect(PAGE_ANALYSIS_SYSTEM_PROMPT).toContain("신뢰할 수 없는"); expect(PAGE_ANALYSIS_SYSTEM_PROMPT).toContain("prompt injection"); expect(PAGE_ANALYSIS_SYSTEM_PROMPT).toContain("절대 따르지"); });
  it("존재하지 않는 element ID와 발견되지 않은 locator를 거부한다", () => {
    const snapshot = { id: "snapshot-1", analysisId: "analysis-1", requestedUrl: "https://example.com/", finalUrl: "https://example.com/", title: "Example", viewport: { width: 1440, height: 900 }, headings: [], forms: [], internalLinks: [], consoleMessages: [], networkIssues: [], collectedAt: new Date().toISOString(), elements: [{ id: "element-1", type: "button", tagName: "button", visible: true, locatorCandidates: [{ strategy: "test_id", value: "real", score: 100, unique: true }], safetyHints: [] }] } as PageSnapshot;
    const base = { title: "테스트", description: "설명", purpose: "목적", category: "visibility" as const, safetyLevel: "safe" as const, confidence: .8, autoExecutable: true };
    expect(() => validateGeneratedTestPayload({ scenarios: [{ ...base, sourceElementIds: ["element-404"], steps: [{ order: 1, action: "assert_visible", description: "표시", elementId: "element-404", evidence: [] }] }] }, snapshot)).toThrow();
    expect(() => validateGeneratedTestPayload({ scenarios: [{ ...base, sourceElementIds: ["element-1"], steps: [{ order: 1, action: "assert_visible", description: "표시", elementId: "element-1", locator: { strategy: "test_id", value: "invented", score: 100, unique: true }, evidence: [] }] }] }, snapshot)).toThrow();
  });
});
