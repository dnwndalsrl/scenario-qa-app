import { describe, expect, it } from "vitest";
import type { AutomatedTestRun } from "../../shared/types/analysis";
import { latestTestSuiteRunSummary } from "../../shared/utils/test-suite-summary";

function run(overrides: Partial<AutomatedTestRun>): AutomatedTestRun {
  return {
    id: "run-1", analysisId: "analysis-1", scenarioId: "test-1", status: "success",
    stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: [],
    trigger: "suite_run", suiteId: "suite-1", suiteRunId: "suite-run-1", queuedAt: "2026-08-24T01:00:00.000Z",
    ...overrides
  };
}

describe("test suite run summary", () => {
  it("summarizes the latest execution group", () => {
    const runs = [
      run({ id: "old", suiteRunId: "old", queuedAt: "2026-08-23T01:00:00.000Z" }),
      run({ id: "success", startedAt: "2026-08-24T01:00:01.000Z", completedAt: "2026-08-24T01:00:05.000Z" }),
      run({ id: "failed", scenarioId: "test-2", status: "failed", startedAt: "2026-08-24T01:00:02.000Z", completedAt: "2026-08-24T01:00:07.000Z" })
    ];

    expect(latestTestSuiteRunSummary("suite-1", runs)).toMatchObject({
      suiteRunId: "suite-run-1", totalCount: 2, successCount: 1, failedCount: 1,
      errorCount: 0, activeCount: 0, status: "failed", durationMs: 6000
    });
  });

  it("reports active and error states and ignores unrelated runs", () => {
    const runs = [
      run({ id: "pending", status: "pending" }),
      run({ id: "error", scenarioId: "test-2", status: "error" }),
      run({ id: "manual", trigger: "manual_rerun", suiteRunId: undefined }),
      run({ id: "other", suiteId: "suite-2" })
    ];

    expect(latestTestSuiteRunSummary("suite-1", runs)).toMatchObject({
      totalCount: 2, successCount: 0, failedCount: 0, errorCount: 1, activeCount: 1, status: "running"
    });
    expect(latestTestSuiteRunSummary("missing", runs)).toBeUndefined();
  });
});
