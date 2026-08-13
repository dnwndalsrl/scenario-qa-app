import { describe, expect, it } from "vitest";
import type { GeneratedTestScenario, PageSnapshot } from "../../shared/types/analysis";
import { buildAddedScenario, buildEditedScenario } from "./generated-test-editor.service";

const snapshot = {
  id: "snapshot-1", analysisId: "analysis-1", requestedUrl: "https://example.com", finalUrl: "https://example.com", title: "Example",
  viewport: { width: 1440, height: 900 }, headings: [], forms: [], internalLinks: [], consoleMessages: [], networkIssues: [], collectedAt: new Date().toISOString(),
  elements: [{ id: "element-1", type: "heading", tagName: "h2", visible: true, locatorCandidates: [{ strategy: "text", value: "ABOUT US", score: 60, unique: true }], safetyHints: [] }]
} as PageSnapshot;
const existing = {
  id: "test-1", analysisId: "analysis-1", title: "이동 확인", description: "", purpose: "URL 이동", category: "navigation", safetyLevel: "review_required", safetyReasons: ["old"],
  confidence: .9, autoExecutable: false, sourceElementIds: [], steps: [{ id: "step-1", order: 1, action: "assert_url", description: "URL 확인", expected: "/about", evidence: [] }], generatedAt: new Date().toISOString()
} as GeneratedTestScenario;

describe("generated test editor", () => {
  it("replaces a URL assertion with a viewport assertion and increments the revision", () => {
    const edited = buildEditedScenario(existing, snapshot, { title: "ABOUT US 섹션 이동", description: "", purpose: "섹션 도달", steps: [{ action: "scroll_into_view", description: "섹션으로 스크롤", elementId: "element-1" }, { action: "assert_in_viewport", description: "섹션 표시", elementId: "element-1" }] });
    expect(edited.steps[0]).toMatchObject({ action: "scroll_into_view", elementId: "element-1", locator: { value: "ABOUT US" } });
    expect(edited.steps[1]).toMatchObject({ action: "assert_in_viewport", elementId: "element-1", locator: { value: "ABOUT US" } });
    expect(edited).toMatchObject({ revision: 2, source: "user", safetyLevel: "safe", autoExecutable: true });
  });

  it("rejects element actions without a discovered unique target", () => {
    expect(() => buildEditedScenario(existing, snapshot, { title: "잘못된 테스트", description: "", purpose: "", steps: [{ action: "click", description: "클릭", elementId: "element-404" }] })).toThrow("대상 요소");
  });

  it("creates a user-owned scenario that is ready for approval", () => {
    const added = buildAddedScenario("analysis-1", snapshot, {
      title: "ABOUT US 섹션 이동",
      description: "같은 페이지에서 섹션으로 스크롤합니다.",
      purpose: "요구사항 확인",
      pageId: null,
      steps: [{ action: "assert_in_viewport", description: "ABOUT US 섹션 표시", elementId: "element-1" }]
    });
    expect(added).toMatchObject({ analysisId: "analysis-1", source: "user", revision: 1, safetyLevel: "safe", autoExecutable: true, requirementIds: [] });
    expect(added.steps[0]).toMatchObject({ action: "assert_in_viewport", elementId: "element-1", locator: { unique: true } });
  });
});
