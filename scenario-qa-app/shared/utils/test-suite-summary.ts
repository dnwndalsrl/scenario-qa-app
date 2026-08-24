import type { AutomatedTestRun } from "../types/analysis";

export interface TestSuiteRunSummary {
  suiteRunId: string;
  retryOfSuiteRunId?: string;
  totalCount: number;
  successCount: number;
  successRate: number;
  failedCount: number;
  errorCount: number;
  activeCount: number;
  status: "running" | "success" | "failed" | "error";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  runs: AutomatedTestRun[];
}

function timestamp(value?: string): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function testSuiteRunSummaries(suiteId: string, runs: AutomatedTestRun[]): TestSuiteRunSummary[] {
  const groups = new Map<string, AutomatedTestRun[]>();
  for (const run of runs) {
    if (run.trigger !== "suite_run" || run.suiteId !== suiteId || !run.suiteRunId) continue;
    groups.set(run.suiteRunId, [...(groups.get(run.suiteRunId) || []), run]);
  }

  return [...groups.entries()].sort(([, left], [, right]) => {
    const leftTime = Math.max(...left.map((run) => timestamp(run.completedAt || run.startedAt || run.queuedAt)));
    const rightTime = Math.max(...right.map((run) => timestamp(run.completedAt || run.startedAt || run.queuedAt)));
    return rightTime - leftTime;
  }).map(([suiteRunId, group]) => {
    const startedTimes = group.map((run) => timestamp(run.startedAt || run.queuedAt)).filter(Boolean);
    const completedTimes = group.map((run) => timestamp(run.completedAt)).filter(Boolean);
    const successCount = group.filter((run) => run.status === "success").length;
    const failedCount = group.filter((run) => run.status === "failed").length;
    const errorCount = group.filter((run) => run.status === "error" || run.status === "blocked").length;
    const activeCount = group.filter((run) => run.status === "pending" || run.status === "running").length;
    const status = activeCount ? "running" : errorCount ? "error" : failedCount ? "failed" : "success";
    const started = startedTimes.length ? Math.min(...startedTimes) : undefined;
    const completed = completedTimes.length === group.length ? Math.max(...completedTimes) : undefined;

    return {
      suiteRunId,
      retryOfSuiteRunId: group.find((run) => run.retryOfSuiteRunId)?.retryOfSuiteRunId,
      totalCount: group.length,
      successCount,
      successRate: group.length ? Math.round((successCount / group.length) * 100) : 0,
      failedCount,
      errorCount,
      activeCount,
      status,
      startedAt: started ? new Date(started).toISOString() : undefined,
      completedAt: completed ? new Date(completed).toISOString() : undefined,
      durationMs: started && completed ? Math.max(0, completed - started) : undefined,
      runs: group
    };
  });
}

export function latestTestSuiteRunSummary(suiteId: string, runs: AutomatedTestRun[]): TestSuiteRunSummary | undefined {
  return testSuiteRunSummaries(suiteId, runs)[0];
}

export function retryableSuiteScenarioIds(suiteId: string, suiteRunId: string, suiteTestIds: string[], runs: AutomatedTestRun[]): string[] {
  const retryable = new Set(runs
    .filter((run) => run.trigger === "suite_run" && run.suiteId === suiteId && run.suiteRunId === suiteRunId && ["failed", "error", "blocked"].includes(run.status))
    .map((run) => run.scenarioId));
  return suiteTestIds.filter((testId) => retryable.has(testId));
}
