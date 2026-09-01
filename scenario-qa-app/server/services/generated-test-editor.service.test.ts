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

  it("stores page scroll preconditions without a target and stability waits with a target", () => {
    const edited = buildEditedScenario(existing, snapshot, {
      title: "동적 영역 확인", description: "", purpose: "동적 상태 재현", steps: [
        { action: "scroll_to_ratio", description: "페이지 하단 상태 재현", value: "75" },
        { action: "scroll_by", description: "동적 헤더 표시", value: "-240" },
        { action: "wait_for_stable", description: "값 안정화", elementId: "element-1", value: "300" },
        { action: "assert_visible", description: "동적 영역 표시", elementId: "element-1" }
      ]
    });
    expect(edited.steps[0]).toMatchObject({ action: "scroll_to_ratio", value: "75", elementId: undefined });
    expect(edited.steps[1]).toMatchObject({ action: "scroll_by", value: "-240", elementId: undefined });
    expect(edited.steps[2]).toMatchObject({ action: "wait_for_stable", elementId: "element-1", locator: { unique: true } });
  });

  it("stores a page-level stability wait without requiring a target", () => {
    const edited = buildEditedScenario(existing, snapshot, {
      title: "페이지 안정화", description: "", purpose: "동적 콘텐츠 대기",
      steps: [{ action: "wait_for_stable", description: "페이지 전체 안정화", value: "300" }, { action: "assert_title", description: "페이지 제목 확인" }]
    });
    expect(edited.steps[0]).toMatchObject({ action: "wait_for_stable", value: "300", elementId: undefined, locator: undefined });
  });

  it("rejects invalid dynamic-state values before execution", () => {
    expect(() => buildEditedScenario(existing, snapshot, { title: "잘못된 스크롤", description: "", purpose: "", steps: [{ action: "scroll_to_ratio", description: "범위 초과", value: "101" }] })).toThrow("0~100");
    expect(() => buildEditedScenario(existing, snapshot, { title: "잘못된 대기", description: "", purpose: "", steps: [{ action: "wait_for_stable", description: "너무 짧음", elementId: "element-1", value: "50" }] })).toThrow("100~5000");
  });

  it("rejects a click-only scenario without an expected-result assertion", () => {
    expect(() => buildEditedScenario(existing, snapshot, { title: "클릭만 수행", description: "", purpose: "", steps: [{ action: "scroll_into_view", description: "대상 이동", elementId: "element-1" }] })).toThrow("예상 결과 확인 단계");
  });

  it("creates a user-owned scenario that is ready for approval", () => {
    const added = buildAddedScenario("analysis-1", snapshot, {
      title: "ABOUT US 섹션 이동",
      description: "같은 페이지에서 섹션으로 스크롤합니다.",
      purpose: "요구사항 확인",
      pageId: null,
      requirementIds: ["REQ-1"],
      steps: [{ action: "assert_in_viewport", description: "ABOUT US 섹션 표시", elementId: "element-1" }]
    });
    expect(added).toMatchObject({ analysisId: "analysis-1", source: "user", revision: 1, safetyLevel: "safe", autoExecutable: true, requirementIds: ["REQ-1"] });
    expect(added.steps[0]).toMatchObject({ action: "assert_in_viewport", elementId: "element-1", locator: { unique: true } });
  });

  it("validates required values for state assertions", () => {
    expect(() => buildEditedScenario(existing, snapshot, { title: "속성 확인", description: "", purpose: "", steps: [{ action: "assert_attribute", description: "속성", elementId: "element-1", expected: "true" }] })).toThrow("속성명");
    expect(() => buildEditedScenario(existing, snapshot, { title: "개수 확인", description: "", purpose: "", steps: [{ action: "assert_count", description: "개수", elementId: "element-1", expected: "-1" }] })).toThrow("0 이상의 정수");
  });
});
