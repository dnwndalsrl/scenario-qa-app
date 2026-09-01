import { describe, expect, it, vi } from "vitest";
import type { AutomatedTestRun } from "../../shared/types/analysis";
import { executeWithAutoRevalidation, shouldAutoRevalidate } from "../../packages/qa-engine/test-revalidation";

function run(status: AutomatedTestRun["status"], failureKind?: AutomatedTestRun["failureKind"]): AutomatedTestRun {
  return { id: crypto.randomUUID(), analysisId: "analysis-1", scenarioId: "test-1", status, failureKind, stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: [] };
}

describe("automatic test revalidation", () => {
  it("revalidates only ambiguous execution failures", () => {
    expect(shouldAutoRevalidate(run("error", "environment_error"))).toBe(true);
    expect(shouldAutoRevalidate(run("error", "automation_limit"))).toBe(true);
    expect(shouldAutoRevalidate(run("error", "inconclusive"))).toBe(true);
    expect(shouldAutoRevalidate(run("failed", "product_defect"))).toBe(false);
    expect(shouldAutoRevalidate(run("blocked", "safety_blocked"))).toBe(false);
  });

  it("runs once more and records recovery when the retry succeeds", async () => {
    const execute = vi.fn().mockResolvedValueOnce(run("error", "environment_error")).mockResolvedValueOnce(run("success"));
    const result = await executeWithAutoRevalidation(execute);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: "success", revalidation: { originalStatus: "error", originalFailureKind: "environment_error", finalStatus: "success", recovered: true } });
  });

  it("does not retry product defects and keeps a repeated environment failure", async () => {
    const defectExecute = vi.fn().mockResolvedValue(run("failed", "product_defect"));
    const defect = await executeWithAutoRevalidation(defectExecute);
    expect(defect.status).toBe("failed");
    expect(defect.revalidation).toBeUndefined();
    expect(defectExecute).toHaveBeenCalledTimes(1);

    const errorExecute = vi.fn().mockResolvedValueOnce(run("error", "automation_limit")).mockResolvedValueOnce(run("error", "automation_limit"));
    expect(await executeWithAutoRevalidation(errorExecute)).toMatchObject({ status: "error", revalidation: { recovered: false, finalStatus: "error" } });
  });
});
