import type { AutomatedTestRun, GeneratedTestScenario, RequirementItem } from "../types/analysis";
import { latestTestRuns } from "./test-run-history";

export type RequirementCoverageStatus = "uncovered" | "not_run" | "running" | "passed" | "failed";

export interface RequirementCoverageItem {
  requirement: RequirementItem;
  tests: GeneratedTestScenario[];
  latestRuns: AutomatedTestRun[];
  status: RequirementCoverageStatus;
}

export function buildRequirementCoverage(requirements: RequirementItem[], tests: GeneratedTestScenario[], runs: AutomatedTestRun[]): RequirementCoverageItem[] {
  const latestByScenario = new Map(latestTestRuns(runs).map((run) => [run.scenarioId, run]));
  return requirements.map((requirement) => {
    const linkedTests = tests.filter((test) => test.requirementIds?.includes(requirement.id));
    const latestRuns = linkedTests.map((test) => latestByScenario.get(test.id)).filter((run): run is AutomatedTestRun => Boolean(run));
    let status: RequirementCoverageStatus = "not_run";
    if (!linkedTests.length) status = "uncovered";
    else if (latestRuns.some((run) => ["failed", "error", "blocked"].includes(run.status) || Boolean(run.failureKind))) status = "failed";
    else if (latestRuns.some((run) => ["pending", "running"].includes(run.status))) status = "running";
    else if (latestRuns.length === linkedTests.length && latestRuns.every((run) => run.status === "success" && !run.failureKind)) status = "passed";
    return { requirement, tests: linkedTests, latestRuns, status };
  });
}
