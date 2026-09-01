import type { AutomatedTestRun } from "../types/analysis";

function runTime(run: AutomatedTestRun): number | undefined {
  const value = run.completedAt || run.startedAt;
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function latestSuccessfulRunAfter(scenarioId: string, since: string, runs: AutomatedTestRun[]): AutomatedTestRun | undefined {
  const sinceTime = Date.parse(since);
  if (Number.isNaN(sinceTime)) return undefined;
  return runs
    .filter((run) => run.scenarioId === scenarioId && run.status === "success" && !run.failureKind && (runTime(run) ?? -1) >= sinceTime)
    .sort((left, right) => (runTime(right) ?? 0) - (runTime(left) ?? 0))[0];
}

export function reviewedRunResolution(run: AutomatedTestRun, runs: AutomatedTestRun[]): AutomatedTestRun | undefined {
  if (!run.review) return undefined;
  return latestSuccessfulRunAfter(run.scenarioId, run.review.reviewedAt, runs);
}
