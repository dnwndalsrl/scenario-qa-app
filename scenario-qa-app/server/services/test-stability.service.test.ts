import { describe, expect, it } from "vitest";
import type { AutomatedTestRun } from "../../shared/types/analysis";
import { testStabilitySummary } from "../../shared/utils/test-stability";

function run(id: string, status: AutomatedTestRun["status"], failureKind?: AutomatedTestRun["failureKind"]): AutomatedTestRun {
  return {
    id, analysisId: "analysis-1", scenarioId: "test-1", status, failureKind,
    stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: [], completedAt: `2026-08-2${id.length}T00:00:00.000Z`
  };
}

describe("test stability summary", () => {
  it("marks three consecutive successes as stable", () => {
    const summary = testStabilitySummary("test-1", [run("a", "success"), run("bb", "success"), run("ccc", "success")]);
    expect(summary).toMatchObject({ status: "stable", executionCount: 3, observationCount: 3, successRate: 100 });
  });

  it("marks mixed success and failure as flaky", () => {
    const summary = testStabilitySummary("test-1", [run("a", "success"), run("bb", "failed", "product_defect"), run("ccc", "success")]);
    expect(summary).toMatchObject({ status: "flaky", successCount: 2, productDefectCount: 1, successRate: 67 });
  });

  it("counts a recovered automatic revalidation as a flaky signal", () => {
    const recovered = run("a", "success");
    recovered.revalidation = {
      attemptedAt: "2026-08-24T00:00:00.000Z", originalStatus: "error", originalFailureKind: "environment_error",
      finalStatus: "success", recovered: true
    };
    const summary = testStabilitySummary("test-1", [recovered]);
    expect(summary).toMatchObject({ status: "flaky", executionCount: 1, observationCount: 2, successCount: 1, environmentErrorCount: 1, recoveredCount: 1, successRate: 50 });
  });

  it("distinguishes repeated product defects and environment failures", () => {
    expect(testStabilitySummary("test-1", [run("a", "failed", "product_defect"), run("bb", "failed", "product_defect"), run("ccc", "failed", "product_defect")]).status).toBe("consistently_failing");
    expect(testStabilitySummary("test-1", [run("a", "error", "environment_error"), run("bb", "error", "automation_limit")]).status).toBe("environment_affected");
  });

  it("uses only the five latest terminal executions", () => {
    const runs = [run("a", "failed", "product_defect"), run("bb", "success"), run("ccc", "success"), run("dddd", "success"), run("eeeee", "success"), run("ffffff", "success"), run("pending", "pending")];
    expect(testStabilitySummary("test-1", runs)).toMatchObject({ status: "stable", executionCount: 5, successRate: 100 });
  });
});
