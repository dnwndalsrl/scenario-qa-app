import { describe, expect, it } from "vitest";
import type { AnalysisDetail, AutomatedTestRun, GeneratedTestScenario } from "../../shared/types/analysis";
import { buildRegressionComparison } from "../../shared/utils/regression-comparison";

function scenario(id: string, title: string): GeneratedTestScenario {
  return { id, analysisId: "analysis", title, description: title, purpose: `${title} 동작 검증`, category: "navigation", safetyLevel: "safe", safetyReasons: [], confidence: .9, autoExecutable: true, sourceElementIds: [], steps: [{ id: `${id}-step`, order: 1, action: "click", description: `${title} 클릭`, evidence: [] }, { id: `${id}-assert`, order: 2, action: "assert_url", description: "이동 확인", expected: "/next", evidence: [] }], generatedAt: "2026-08-01T00:00:00Z" };
}
function run(id: string, scenarioId: string, status: AutomatedTestRun["status"]): AutomatedTestRun {
  return { id, analysisId: "analysis", scenarioId, status, stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: [], completedAt: "2026-08-01T00:01:00Z" };
}
function detail(id: string, tests: GeneratedTestScenario[], runs: AutomatedTestRun[]): AnalysisDetail {
  return { analysis: { id, targetUrl: "https://example.com", normalizedUrl: "https://example.com/", status: "completed", progress: 100, options: { mode: "single_page", testMode: "read_only", autoRunSafeTests: true, viewport: { width: 1440, height: 900 }, timeoutMs: 30000, maxPages: 1, maxDepth: 0, includeQueryUrls: false, respectNoFollow: true }, pageIds: [], pageAnalysisIds: [], generatedTestIds: tests.map((test) => test.id), testRunIds: runs.map((item) => item.id), createdAt: id === "current" ? "2026-08-02T00:00:00Z" : "2026-08-01T00:00:00Z", updatedAt: "2026-08-02T00:00:00Z" }, generatedTests: tests, testRuns: runs, pages: [] };
}

describe("regression comparison", () => {
  it("classifies regressions, resolved tests, and persistent failures", () => {
    const baselineTests = [scenario("old-a", "메뉴 이동"), scenario("old-b", "소개 이동"), scenario("old-c", "문의 이동")];
    const currentTests = [scenario("new-a", "메뉴 이동"), scenario("new-b", "소개 이동"), scenario("new-c", "문의 이동")];
    const comparison = buildRegressionComparison(
      detail("current", currentTests, [run("new-a-run", "new-a", "failed"), run("new-b-run", "new-b", "success"), run("new-c-run", "new-c", "failed")]),
      detail("baseline", baselineTests, [run("old-a-run", "old-a", "success"), run("old-b-run", "old-b", "failed"), run("old-c-run", "old-c", "failed")])
    );
    expect(comparison.changes.map((change) => change.status)).toEqual(["new_failure", "resolved", "persistent_failure"]);
    expect(comparison.successRateDelta).toBe(0);
  });

  it("matches a slightly renamed scenario by purpose and actions", () => {
    const oldTest = scenario("old", "ABOUT US 메뉴 이동");
    const newTest = { ...scenario("new", "ABOUT US 영역 이동 확인"), purpose: oldTest.purpose };
    const comparison = buildRegressionComparison(detail("current", [newTest], [run("new-run", "new", "success")]), detail("baseline", [oldTest], [run("old-run", "old", "success")]));
    expect(comparison.changes[0]).toMatchObject({ status: "stable_success", baselineScenarioId: "old" });
  });

  it("reports added and removed scenarios", () => {
    const comparison = buildRegressionComparison(
      detail("current", [scenario("new", "새 검색")], []),
      detail("baseline", [scenario("old", "기존 로그인")], [run("old-run", "old", "success")])
    );
    expect(comparison.changes.map((change) => change.status)).toEqual(["added", "removed"]);
    expect(comparison).toMatchObject({ addedScenarioCount: 1, removedScenarioCount: 1 });
  });
});
