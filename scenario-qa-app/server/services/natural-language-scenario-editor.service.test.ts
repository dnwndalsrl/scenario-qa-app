import { describe, expect, it } from "vitest";
import type { GeneratedTestScenario, PageSnapshot } from "../../shared/types/analysis";
import { naturalLanguageEditorElements, validateNaturalLanguageScenarioDraft } from "./natural-language-scenario-editor.service";

const snapshot = {
  id: "snapshot-1", analysisId: "analysis-1", requestedUrl: "https://example.com", finalUrl: "https://example.com", title: "Example",
  viewport: { width: 1440, height: 900 }, headings: [], forms: [], internalLinks: [], consoleMessages: [], networkIssues: [], collectedAt: new Date().toISOString(),
  elements: [{ id: "element-1", type: "link", tagName: "a", accessibleName: "ABOUT US", href: "https://example.com/#about", visible: true, actionable: true, locatorCandidates: [{ strategy: "text", value: "ABOUT US", score: 80, unique: true }], safetyHints: [] }]
} as PageSnapshot;

const existing = {
  id: "test-1", analysisId: "analysis-1", title: "ABOUT US 이동", description: "", purpose: "섹션 이동 확인", category: "navigation", safetyLevel: "safe", safetyReasons: [],
  confidence: .9, autoExecutable: true, sourceElementIds: ["element-1"], steps: [{ id: "step-1", order: 1, action: "click", description: "ABOUT US 클릭", elementId: "element-1", locator: snapshot.elements[0]!.locatorCandidates[0], evidence: [] }], generatedAt: new Date().toISOString()
} as GeneratedTestScenario;

describe("natural language scenario editor", () => {
  it("only gives the AI elements that the scenario editor can execute", () => {
    const elements = naturalLanguageEditorElements({ ...snapshot, elements: [...snapshot.elements, { ...snapshot.elements[0]!, id: "element-2", locatorCandidates: [] }] });
    expect(elements.map((element) => element.id)).toEqual(["element-1"]);
  });

  it("returns an editable draft only after the existing scenario validator accepts it", () => {
    const result = validateNaturalLanguageScenarioDraft(existing, snapshot, {
      summary: "URL 이동 검증을 섹션 스크롤 검증으로 바꿨습니다.",
      title: "ABOUT US 섹션 이동",
      description: "같은 문서의 ABOUT US 영역으로 이동하는지 확인합니다.",
      purpose: "섹션 스크롤 확인",
      steps: [
        { action: "click", description: "ABOUT US 클릭", elementId: "element-1", value: null, expected: null, timeoutMs: null },
        { action: "assert_scroll", description: "ABOUT US 섹션 도달 확인", elementId: null, value: null, expected: "#about", timeoutMs: null }
      ]
    });

    expect(result.summary).toContain("섹션 스크롤");
    expect(result.draft.steps).toEqual([
      { action: "click", description: "ABOUT US 클릭", elementId: "element-1" },
      { action: "assert_scroll", description: "ABOUT US 섹션 도달 확인", expected: "#about" }
    ]);
  });

  it("rejects an invented element id", () => {
    expect(() => validateNaturalLanguageScenarioDraft(existing, snapshot, {
      summary: "없는 요소로 바꿨습니다.", title: "잘못된 초안", description: "", purpose: "검증",
      steps: [{ action: "assert_visible", description: "없는 요소 확인", elementId: "element-404", value: null, expected: null, timeoutMs: null }]
    })).toThrow("대상 요소");
  });

  it("rejects a draft that ends after an action without an expected-result assertion", () => {
    expect(() => validateNaturalLanguageScenarioDraft(existing, snapshot, {
      summary: "클릭만 남겼습니다.", title: "불완전한 초안", description: "", purpose: "검증",
      steps: [{ action: "click", description: "ABOUT US 클릭", elementId: "element-1", value: null, expected: null, timeoutMs: null }]
    })).toThrow("예상 결과 확인 단계");
  });
});
