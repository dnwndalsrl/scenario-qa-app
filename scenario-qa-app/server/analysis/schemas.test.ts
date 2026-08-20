import { describe, expect, it } from "vitest";
import { z } from "zod";
import { aiPageAnalysisResponseSchema, generatedTestResponseSchema } from "../../shared/schemas/analysis";
import { PAGE_ANALYSIS_SYSTEM_PROMPT } from "./prompts/page-analysis.prompt";
import { buildFallbackTests, validateGeneratedTestPayload } from "./services/ai-test-generation.service";
import type { PageSnapshot } from "../../shared/types/analysis";

describe("AI 구조화 출력 검증", () => {
  const page = { pageType: "landing", pagePurpose: "소개", primaryFunctions: [], risks: [], testOpportunities: [], confidence: .8, limitations: [] };
  it("정상 페이지 분석 응답을 허용한다", () => expect(aiPageAnalysisResponseSchema.safeParse(page).success).toBe(true));
  it("허용되지 않은 page type과 confidence를 거부한다", () => { expect(aiPageAnalysisResponseSchema.safeParse({ ...page, pageType: "admin" }).success).toBe(false); expect(aiPageAnalysisResponseSchema.safeParse({ ...page, confidence: 2 }).success).toBe(false); });
  it("허용되지 않은 action과 최대 단계 수를 거부한다", () => {
    const base = { title: "테스트", description: "설명", purpose: "목적", category: "visibility", safetyLevel: "safe", confidence: .8, autoExecutable: true, sourceElementIds: ["element-1"], requirementIds: [] };
    expect(generatedTestResponseSchema.safeParse({ scenarios: [{ ...base, steps: [{ order: 1, action: "evaluate", description: "위험", evidence: [] }] }] }).success).toBe(false);
    expect(generatedTestResponseSchema.safeParse({ scenarios: [{ ...base, steps: Array.from({ length: 11 }, (_, index) => ({ order: index + 1, action: "goto", description: "이동", evidence: [] })) }] }).success).toBe(false);
  });
  it("OpenAI strict 출력용 step 스키마는 모든 property를 required로 선언한다", () => {
    const schema = z.toJSONSchema(generatedTestResponseSchema) as any;
    const stepSchema = schema.properties.scenarios.items.properties.steps.items;
    expect(stepSchema.required).toEqual(Object.keys(stepSchema.properties));
  });
  it("페이지 prompt injection을 지시로 취급하지 않는 정책을 고정한다", () => { expect(PAGE_ANALYSIS_SYSTEM_PROMPT).toContain("신뢰할 수 없는"); expect(PAGE_ANALYSIS_SYSTEM_PROMPT).toContain("prompt injection"); expect(PAGE_ANALYSIS_SYSTEM_PROMPT).toContain("절대 따르지"); });
  it("동적 페이지 상태를 재현하는 읽기 전용 action을 허용한다", () => {
    const base = { title: "동적 상태", description: "설명", purpose: "목적", category: "visibility", safetyLevel: "safe", confidence: .8, autoExecutable: true, sourceElementIds: [], requirementIds: [] };
    const steps = ["scroll_to_ratio", "scroll_by", "wait_for_stable"].map((action, index) => ({ order: index + 1, action, description: action, elementId: null, locator: null, value: "300", expected: null, timeoutMs: null, evidence: [] }));
    expect(generatedTestResponseSchema.safeParse({ scenarios: [{ ...base, steps }] }).success).toBe(true);
  });
  it("존재하지 않는 element ID와 발견되지 않은 locator를 거부한다", () => {
    const snapshot = { id: "snapshot-1", analysisId: "analysis-1", requestedUrl: "https://example.com/", finalUrl: "https://example.com/", title: "Example", viewport: { width: 1440, height: 900 }, headings: [], forms: [], internalLinks: [], consoleMessages: [], networkIssues: [], collectedAt: new Date().toISOString(), elements: [{ id: "element-1", type: "button", tagName: "button", visible: true, locatorCandidates: [{ strategy: "test_id", value: "real", score: 100, unique: true }], safetyHints: [] }] } as PageSnapshot;
    const base = { title: "테스트", description: "설명", purpose: "목적", category: "visibility" as const, safetyLevel: "safe" as const, confidence: .8, autoExecutable: true, requirementIds: [] };
    expect(() => validateGeneratedTestPayload({ scenarios: [{ ...base, sourceElementIds: ["element-404"], steps: [{ order: 1, action: "assert_visible", description: "표시", elementId: "element-404", locator: null, value: null, expected: null, timeoutMs: null, evidence: [] }] }] }, snapshot)).toThrow();
    expect(() => validateGeneratedTestPayload({ scenarios: [{ ...base, sourceElementIds: ["element-1"], steps: [{ order: 1, action: "assert_visible", description: "표시", elementId: "element-1", locator: { strategy: "test_id", value: "invented", score: 100, unique: true }, value: null, expected: null, timeoutMs: null, evidence: [] }] }] }, snapshot)).toThrow();
  });
  it("요소가 없는 페이지 단위 안정화 대기를 허용한다", () => {
    const snapshot = { id: "snapshot-1", analysisId: "analysis-1", requestedUrl: "https://example.com/", finalUrl: "https://example.com/", title: "Example", viewport: { width: 1440, height: 900 }, headings: [], forms: [], internalLinks: [], consoleMessages: [], networkIssues: [], collectedAt: new Date().toISOString(), elements: [] } as PageSnapshot;
    const base = { title: "동적 페이지", description: "설명", purpose: "안정화", category: "visibility" as const, safetyLevel: "safe" as const, confidence: .8, autoExecutable: true, requirementIds: [], sourceElementIds: [] };
    const [scenario] = validateGeneratedTestPayload({ scenarios: [{ ...base, steps: [{ order: 1, action: "wait_for_stable", description: "페이지 안정화", elementId: null, locator: null, value: "300", expected: null, timeoutMs: null, evidence: [] }] }] }, snapshot);
    expect(scenario?.steps[0]).toMatchObject({ action: "wait_for_stable", elementId: undefined, value: "300" });
  });
  it("heading 클릭을 동일 이름의 실제 href 링크로 보정하고 대체 링크가 없으면 거부한다", () => {
    const hrefLocator = { strategy: "css" as const, value: 'a[href$="/smartfarm/system/"]', score: 85, unique: false };
    const snapshot = { id: "snapshot-1", analysisId: "analysis-1", requestedUrl: "https://example.com/", finalUrl: "https://example.com/", title: "Example", viewport: { width: 1440, height: 900 }, headings: [], forms: [], internalLinks: [], consoleMessages: [], networkIssues: [], collectedAt: new Date().toISOString(), elements: [
      { id: "element-link", type: "link", tagName: "a", role: "link", accessibleName: "Smart-Farm 시스템", href: "https://example.com/smartfarm/system/", visible: true, locatorCandidates: [hrefLocator], safetyHints: [] },
      { id: "element-covered", type: "link", tagName: "a", role: "link", accessibleName: "가려진 링크", href: "https://example.com/covered/", visible: true, actionable: false, locatorCandidates: [{ strategy: "role", value: "link::가려진 링크", score: 90, unique: true }], safetyHints: [] },
      { id: "element-heading", type: "heading", tagName: "h3", role: "heading", text: "Smart-Farm 시스템", visible: true, locatorCandidates: [{ strategy: "text", value: "Smart-Farm 시스템", score: 60, unique: true }], safetyHints: [] },
      { id: "element-orphan", type: "heading", tagName: "h3", role: "heading", text: "연결 없는 제목", visible: true, locatorCandidates: [{ strategy: "text", value: "연결 없는 제목", score: 60, unique: true }], safetyHints: [] }
    ] } as PageSnapshot;
    const base = { title: "카드 이동", description: "설명", purpose: "내부 이동", category: "navigation" as const, safetyLevel: "safe" as const, confidence: .8, autoExecutable: true, requirementIds: [] };
    const step = { order: 1, action: "click" as const, description: "카드 클릭", locator: hrefLocator, value: null, expected: null, timeoutMs: null, evidence: [] };

    expect(validateGeneratedTestPayload({ scenarios: [{ ...base, sourceElementIds: ["element-link"], steps: [{ ...step, elementId: "element-link" }] }] }, snapshot)[0]?.steps[0]).toMatchObject({ elementId: "element-link", expected: "url-prefix:https://example.com/smartfarm/system/" });
    expect(validateGeneratedTestPayload({ scenarios: [{ ...base, sourceElementIds: ["element-heading"], steps: [{ ...step, elementId: "element-heading", locator: null }] }] }, snapshot)[0]?.steps[0]).toMatchObject({ elementId: "element-link", locator: hrefLocator, expected: "url-prefix:https://example.com/smartfarm/system/" });
    expect(() => validateGeneratedTestPayload({ scenarios: [{ ...base, sourceElementIds: ["element-orphan"], steps: [{ ...step, elementId: "element-orphan", locator: null }] }] }, snapshot)).toThrow();
  });
  it("AI 검증 실패 시 실제 내부 링크를 사용하는 안전한 대체 시나리오를 만든다", () => {
    const hrefLocator = { strategy: "css" as const, value: 'a[href$="/smartfarm/system/"]', score: 85, unique: false };
    const snapshot = { id: "snapshot-1", analysisId: "analysis-1", requestedUrl: "https://example.com/", finalUrl: "https://example.com/", title: "Example", viewport: { width: 1440, height: 900 }, headings: [], forms: [], internalLinks: [], consoleMessages: [], networkIssues: [], collectedAt: new Date().toISOString(), elements: [
      { id: "element-link", type: "link", tagName: "a", role: "link", accessibleName: "Smart-Farm 시스템", href: "https://example.com/smartfarm/system/", visible: true, locatorCandidates: [hrefLocator], safetyHints: [] },
      { id: "element-skip", type: "link", tagName: "a", role: "link", accessibleName: "Skip to content", href: "https://example.com/#content", visible: true, locatorCandidates: [{ strategy: "role", value: "link::Skip to content", score: 90, unique: true }], safetyHints: [] },
      { id: "element-home", type: "link", tagName: "a", role: "link", accessibleName: "Home", href: "https://example.com/", visible: true, locatorCandidates: [{ strategy: "role", value: "link::Home", score: 90, unique: true }], safetyHints: [] }
    ] } as PageSnapshot;

    expect(buildFallbackTests(snapshot)).toHaveLength(1);
    expect(buildFallbackTests(snapshot)[0]).toMatchObject({ safetyLevel: "safe", sourceElementIds: ["element-link"], steps: [{ action: "wait_for_stable" }, { action: "click", elementId: "element-link", locator: hrefLocator, expected: "url-prefix:https://example.com/smartfarm/system/" }] });
  });
});
