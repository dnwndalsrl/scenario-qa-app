import { describe, expect, it } from "vitest";
import type { GeneratedTestScenario, PageSnapshot } from "../../../shared/types/analysis";
import { ensureScenarioAssertions } from "./scenario-verification.service";

const snapshot = {
  id: "snapshot-1", analysisId: "analysis-1", requestedUrl: "https://example.com/", finalUrl: "https://example.com/", title: "Example",
  viewport: { width: 1440, height: 900 }, headings: [], forms: [], internalLinks: [], consoleMessages: [], networkIssues: [], collectedAt: new Date().toISOString(),
  elements: [
    { id: "link-page", type: "link", tagName: "a", href: "/en", visible: true, actionable: true, locatorCandidates: [], safetyHints: [] },
    { id: "link-section", type: "link", tagName: "a", href: "#about", visible: true, actionable: true, locatorCandidates: [], safetyHints: [] },
    { id: "button", type: "button", tagName: "button", visible: true, actionable: true, locatorCandidates: [], safetyHints: [] },
    { id: "accordion", type: "button", tagName: "button", visible: true, actionable: true, stateAttributes: { "aria-expanded": "false" }, locatorCandidates: [{ strategy: "test_id", value: "accordion", score: 100, unique: true }], safetyHints: [] }
  ]
} as PageSnapshot;

function scenario(elementId: string): GeneratedTestScenario {
  return {
    id: "test-1", analysisId: "analysis-1", title: "이동", description: "", purpose: "이동 확인", category: "navigation",
    safetyLevel: "safe", safetyReasons: [], confidence: .8, autoExecutable: true, sourceElementIds: [elementId], generatedAt: new Date().toISOString(),
    steps: [
      { id: "wait", order: 1, action: "wait_for_stable", description: "대기", evidence: [] },
      { id: "click", order: 2, action: "click", description: "클릭", elementId, evidence: [] }
    ]
  };
}

describe("scenario verification", () => {
  it("adds an explicit URL assertion after a page link click", () => {
    expect(ensureScenarioAssertions(scenario("link-page"), snapshot).steps[2]).toMatchObject({ action: "assert_url", expected: "url-prefix:https://example.com/en" });
  });

  it("adds an explicit scroll assertion after a hash link click", () => {
    expect(ensureScenarioAssertions(scenario("link-section"), snapshot).steps[2]).toMatchObject({ action: "assert_scroll", expected: "#about" });
  });

  it("requires review when a click outcome cannot be inferred", () => {
    expect(ensureScenarioAssertions(scenario("button"), snapshot)).toMatchObject({ safetyLevel: "review_required", autoExecutable: false });
  });

  it("adds an attribute assertion for a safe aria state toggle", () => {
    expect(ensureScenarioAssertions(scenario("accordion"), snapshot).steps[2]).toMatchObject({ action: "assert_attribute", elementId: "accordion", value: "aria-expanded", expected: "true" });
  });

  it("does not duplicate an existing assertion", () => {
    const input = scenario("link-page");
    input.steps.push({ id: "assert", order: 3, action: "assert_url", description: "URL 확인", expected: "/en", evidence: [] });
    expect(ensureScenarioAssertions(input, snapshot).steps).toHaveLength(3);
  });
});
