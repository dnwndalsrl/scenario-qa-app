import { describe, expect, it } from "vitest";
import type { AutomatedTestRun } from "../../shared/types/analysis";
import { latestSuccessfulRunAfter, reviewedRunResolution } from "../../shared/utils/test-run-follow-up";

const run = (id: string, status: AutomatedTestRun["status"], completedAt: string): AutomatedTestRun => ({
  id, analysisId: "analysis-1", scenarioId: "test-1", status, completedAt,
  stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: []
});

describe("test run follow-up", () => {
  it("finds the latest clean success after user review", () => {
    const reviewed = { ...run("failed", "failed", "2026-08-28T00:00:00.000Z"), review: { classification: "scenario_error" as const, reviewedAt: "2026-08-28T01:00:00.000Z" } };
    const resolved = reviewedRunResolution(reviewed, [reviewed, run("before", "success", "2026-08-28T00:30:00.000Z"), run("after-1", "success", "2026-08-28T02:00:00.000Z"), run("after-2", "success", "2026-08-28T03:00:00.000Z")]);
    expect(resolved?.id).toBe("after-2");
  });

  it("ignores successes before the follow-up point and successes with a failure kind", () => {
    const affected = { ...run("affected", "success", "2026-08-28T02:00:00.000Z"), failureKind: "environment_error" as const };
    expect(latestSuccessfulRunAfter("test-1", "2026-08-28T01:00:00.000Z", [run("before", "success", "2026-08-28T00:00:00.000Z"), affected])).toBeUndefined();
  });
});
