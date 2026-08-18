import type { AutomatedTestRun } from "../types/analysis";

function runTime(run: AutomatedTestRun): number | undefined {
  const value = run.completedAt || run.startedAt;
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function latestTestRuns(runs: AutomatedTestRun[]): AutomatedTestRun[] {
  const latestByScenario = new Map<string, { run: AutomatedTestRun; index: number; time?: number }>();

  runs.forEach((run, index) => {
    const previous = latestByScenario.get(run.scenarioId);
    const time = runTime(run);
    if (!previous || time === undefined || previous.time === undefined || time >= previous.time) {
      latestByScenario.set(run.scenarioId, { run, index, time });
    }
  });

  return [...latestByScenario.values()].sort((left, right) => left.index - right.index).map(({ run }) => run);
}

export function splitTestRunHistory(runs: AutomatedTestRun[]) {
  const currentIds = new Set(latestTestRuns(runs).map((run) => run.id));
  return {
    current: runs.filter((run) => currentIds.has(run.id)),
    previous: runs.filter((run) => !currentIds.has(run.id)).reverse()
  };
}
