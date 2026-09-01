import { describe, expect, it } from "vitest";
import type { AutomatedTestRun, GeneratedTestScenario, RequirementItem } from "../../shared/types/analysis";
import { buildRequirementCoverage } from "../../shared/utils/requirement-coverage";

const requirements: RequirementItem[] = [
  { id: "REQ-1", title: "섹션 이동", description: "", expectedBehavior: "ABOUT US 섹션으로 이동", priority: "high", sourceReference: "1쪽" },
  { id: "REQ-2", title: "문의 표시", description: "", expectedBehavior: "문의 영역 표시", priority: "medium", sourceReference: "2쪽" }
];
const test = (id: string, requirementIds: string[]): GeneratedTestScenario => ({ id, analysisId: "analysis-1", title: id, description: "", purpose: "", category: "interaction", safetyLevel: "safe", safetyReasons: [], confidence: 1, autoExecutable: true, sourceElementIds: [], steps: [], generatedAt: "2026-08-28T00:00:00.000Z", requirementIds });
const run = (id: string, scenarioId: string, status: AutomatedTestRun["status"], completedAt: string): AutomatedTestRun => ({ id, analysisId: "analysis-1", scenarioId, status, completedAt, stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: [] });

describe("requirement coverage", () => {
  it("separates uncovered, unexecuted and passed requirements", () => {
    const result = buildRequirementCoverage(requirements, [test("test-1", ["REQ-1"])], [run("run-1", "test-1", "success", "2026-08-28T01:00:00.000Z")]);
    expect(result.map((item) => item.status)).toEqual(["passed", "uncovered"]);
  });

  it("uses the latest scenario result and gives failures precedence", () => {
    const tests = [test("test-1", ["REQ-1"]), test("test-2", ["REQ-1"]), test("test-3", ["REQ-2"])];
    const runs = [run("old", "test-1", "failed", "2026-08-28T00:00:00.000Z"), run("new", "test-1", "success", "2026-08-28T02:00:00.000Z"), run("failed", "test-2", "failed", "2026-08-28T02:00:00.000Z")];
    const result = buildRequirementCoverage(requirements, tests, runs);
    expect(result[0]?.status).toBe("failed");
    expect(result[1]?.status).toBe("not_run");
  });

  it("does not count a nominal success with an unresolved failure kind as verified", () => {
    const affected = { ...run("run-1", "test-1", "success", "2026-08-28T01:00:00.000Z"), failureKind: "environment_error" as const };
    expect(buildRequirementCoverage(requirements, [test("test-1", ["REQ-1"])], [affected])[0]?.status).toBe("failed");
  });
});
