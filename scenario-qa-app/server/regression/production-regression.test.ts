import { describe, expect, it } from "vitest";
import type { AutomatedTestRun, PageSnapshot } from "../../shared/types/analysis";
import { buildDoctorAgRegressionScenarios, summarizeProductionRegression } from "./production-regression";

const element = (id: string, name: string, href?: string) => ({
  id, type: href ? "link" as const : "heading" as const, tagName: href ? "a" : "h2", accessibleName: name, text: name, href,
  visible: true, actionable: true, locatorCandidates: [{ strategy: href ? "css" as const : "text" as const, value: href ? `a[href$="${new URL(href).pathname}"]` : name, score: 85, unique: true }], safetyHints: []
});

const snapshot = {
  id: "snapshot-1", analysisId: "analysis-1", requestedUrl: "https://doctor-ag.com/", finalUrl: "https://doctor-ag.com/", title: "Dr.AG",
  viewport: { width: 1440, height: 900 }, headings: [], forms: [], consoleMessages: [], networkIssues: [], collectedAt: new Date().toISOString(),
  elements: [
    element("element-product", "Product", "https://doctor-ag.com/product/"), element("element-doctor", "Dr. AG", "https://doctor-ag.com/dr-ag/"),
    element("element-annual", "연간 버섯 출하량"), element("element-top", "Top", "https://doctor-ag.com/")
  ],
  internalLinks: [
    { elementId: "element-product", href: "https://doctor-ag.com/product/", accessibleName: "Product", internal: true, region: "header" as const },
    { elementId: "element-doctor", href: "https://doctor-ag.com/dr-ag/", accessibleName: "Dr. AG", internal: true, region: "header" as const }
  ]
} satisfies PageSnapshot;

describe("production regression profile", () => {
  it("builds four read-only Doctor.AG regression scenarios", () => {
    const scenarios = buildDoctorAgRegressionScenarios(snapshot);
    expect(scenarios).toHaveLength(4);
    expect(scenarios.every((item) => item.safetyLevel === "safe" && item.autoExecutable)).toBe(true);
    expect(scenarios.map((item) => item.id)).toEqual([
      "production-regression-product-redirect", "production-regression-dynamic-header-link",
      "production-regression-annual-volume-viewport", "production-regression-top-scroll"
    ]);
    expect(scenarios[3]?.steps[1]).toMatchObject({ action: "click", expected: "scroll" });
  });

  it("separates product defects from inconclusive automation results", () => {
    const run = (status: AutomatedTestRun["status"], failureKind?: AutomatedTestRun["failureKind"]): AutomatedTestRun => ({
      id: crypto.randomUUID(), analysisId: "analysis-1", scenarioId: crypto.randomUUID(), status, failureKind,
      stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: []
    });
    expect(summarizeProductionRegression([run("success"), run("failed", "product_defect"), run("error", "automation_limit")])).toEqual({
      overallStatus: "failed", totalCount: 3, successCount: 1, productDefectCount: 1, inconclusiveCount: 1
    });
    expect(summarizeProductionRegression([run("success"), run("error", "environment_error")]).overallStatus).toBe("passed_with_warnings");
  });
});
