import { describe, expect, it } from "vitest";
import type { PageSnapshot, RequirementItem } from "../../shared/types/analysis";
import { selectRequirementSnapshot, validateRequirementScenarioDraft } from "./requirement-scenario-draft.service";

const requirement: RequirementItem = { id: "REQ-1", title: "ABOUT US 섹션 이동", description: "메뉴를 누르면 같은 페이지의 소개 섹션으로 이동", expectedBehavior: "ABOUT US 제목이 화면에 표시됨", priority: "high", sourceReference: "2쪽" };
const snapshot = (id: string, title: string, elementText: string): PageSnapshot => ({
  id, analysisId: "analysis-1", pageId: id, requestedUrl: `https://example.com/${id}`, finalUrl: `https://example.com/${id}`, title,
  viewport: { width: 1440, height: 900 }, headings: [], forms: [], internalLinks: [], consoleMessages: [], networkIssues: [], collectedAt: new Date().toISOString(),
  elements: [{ id: "element-1", type: "heading", tagName: "h2", text: elementText, visible: true, locatorCandidates: [{ strategy: "text", value: elementText, score: 80, unique: true }], safetyHints: [] }]
});

describe("requirement scenario draft", () => {
  it("selects the page with matching requirement evidence", () => {
    expect(selectRequirementSnapshot(requirement, [snapshot("product", "제품", "제품 소개"), snapshot("about", "회사 소개", "ABOUT US")])?.pageId).toBe("about");
  });

  it("does not guess a page when multiple snapshots have no matching evidence", () => {
    expect(selectRequirementSnapshot(requirement, [snapshot("product", "제품", "가격"), snapshot("contact", "문의", "전화")])).toBeUndefined();
  });

  it("returns an explicit implementation check when verification is impossible", () => {
    expect(validateRequirementScenarioDraft(requirement, snapshot("about", "회사 소개", "ABOUT US"), {
      verificationPossible: false, reason: "클릭 대상 요소가 없습니다.", summary: "", confidence: 0.2, title: "", description: "", purpose: "", steps: []
    })).toEqual({ verificationPossible: false, reason: "클릭 대상 요소가 없습니다." });
  });

  it("validates element ids and expected-result assertions before returning a draft", () => {
    const page = snapshot("about", "회사 소개", "ABOUT US");
    const raw = { verificationPossible: true, reason: "", summary: "소개 섹션 표시를 확인합니다.", confidence: 0.9, title: "ABOUT US 표시", description: "", purpose: "요구사항 검증", steps: [{ action: "assert_in_viewport" as const, description: "소개 제목 표시", elementId: "element-1", value: null, expected: null, timeoutMs: null }] };
    expect(validateRequirementScenarioDraft(requirement, page, raw)).toMatchObject({ verificationPossible: true, draft: { pageId: "about", requirementIds: ["REQ-1"] } });
    expect(() => validateRequirementScenarioDraft(requirement, page, { ...raw, steps: [{ action: "assert_in_viewport", description: "소개 제목 표시", elementId: "element-404", value: null, expected: null, timeoutMs: null }] })).toThrow("대상 요소");
  });
});
