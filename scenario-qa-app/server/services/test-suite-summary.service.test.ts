import { describe, expect, it } from "vitest";
import type { AutomatedTestRun } from "../../shared/types/analysis";
import { latestTestSuiteRunSummary, retryableSuiteScenarioIds, testSuiteRunSummaries } from "../../shared/utils/test-suite-summary";

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

  it("returns execution history in latest-first order with individual runs", () => {
    const runs = [
      run({ id: "old", suiteRunId: "old", queuedAt: "2026-08-23T01:00:00.000Z" }),
      run({ id: "latest-success", queuedAt: "2026-08-24T01:00:00.000Z" }),
      run({ id: "latest-error", scenarioId: "test-2", status: "error", queuedAt: "2026-08-24T01:00:00.000Z" })
    ];

    const history = testSuiteRunSummaries("suite-1", runs);
    expect(history.map((summary) => summary.suiteRunId)).toEqual(["suite-run-1", "old"]);
    expect(history[0]).toMatchObject({ totalCount: 2, successCount: 1, errorCount: 1, successRate: 50 });
    expect(history[0]?.runs.map((item) => item.id)).toEqual(["latest-success", "latest-error"]);
  });

  it("selects only failed, error, and blocked scenarios from the requested execution", () => {
    const runs = [
      run({ id: "success", scenarioId: "test-1" }),
      run({ id: "failed", scenarioId: "test-2", status: "failed" }),
      run({ id: "error", scenarioId: "test-3", status: "error" }),
      run({ id: "blocked", scenarioId: "test-4", status: "blocked" }),
      run({ id: "other-run", scenarioId: "test-5", status: "failed", suiteRunId: "other" })
    ];

    expect(retryableSuiteScenarioIds("suite-1", "suite-run-1", ["test-1", "test-2", "test-3", "test-4"], runs))
      .toEqual(["test-2", "test-3", "test-4"]);
  });
});
