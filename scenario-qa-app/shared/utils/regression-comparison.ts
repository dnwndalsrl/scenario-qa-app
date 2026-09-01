import type { AnalysisDetail, AutomatedTestRun, GeneratedTestScenario, RegressionChangeStatus, RegressionComparison, RegressionTestChange, TestRunStatus } from "../types/analysis";
import { latestTestRuns } from "./test-run-history";

const issueStatuses = new Set<TestRunStatus>(["failed", "error", "blocked"]);

function normalize(value: string): string {
  return value.toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(" ").filter(Boolean));
}

function similarity(left: string, right: string): number {
  const a = tokens(left); const b = tokens(right);
  if (!a.size && !b.size) return 1;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

function scenarioScore(current: GeneratedTestScenario, baseline: GeneratedTestScenario): number {
  if (current.category !== baseline.category) return 0;
  if (normalize(current.title) === normalize(baseline.title)) return 1;
  const currentActions = current.steps.map((step) => step.action).join(" ");
  const baselineActions = baseline.steps.map((step) => step.action).join(" ");
  return similarity(current.title, baseline.title) * .55
    + similarity(current.purpose, baseline.purpose) * .25
    + similarity(currentActions, baselineActions) * .2;
}

function latestByScenario(runs: AutomatedTestRun[], scenarios: GeneratedTestScenario[]): Map<string, AutomatedTestRun> {
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
  return new Map(latestTestRuns(runs).filter((run) => scenarioIds.has(run.scenarioId)).map((run) => [run.scenarioId, run]));
}

function state(current?: TestRunStatus, baseline?: TestRunStatus, added = false): RegressionChangeStatus {
  if (!current) return added ? "added" : "unverified";
  if (!baseline) return issueStatuses.has(current) ? "new_failure" : added ? "added" : "unverified";
  if (issueStatuses.has(current)) return issueStatuses.has(baseline) ? "persistent_failure" : "new_failure";
  if (current === "success") return issueStatuses.has(baseline) ? "resolved" : baseline === "success" ? "stable_success" : "unverified";
  return "unverified";
}

function successRate(runs: Map<string, AutomatedTestRun>): number {
  const completed = [...runs.values()].filter((run) => ["success", "failed", "error", "blocked"].includes(run.status));
  return completed.length ? Math.round(completed.filter((run) => run.status === "success").length / completed.length * 100) : 0;
}

export function buildRegressionComparison(current: AnalysisDetail, baseline: AnalysisDetail): RegressionComparison {
  const currentRuns = latestByScenario(current.testRuns, current.generatedTests);
  const baselineRuns = latestByScenario(baseline.testRuns, baseline.generatedTests);
  const unmatchedBaseline = new Set(baseline.generatedTests.map((test) => test.id));
  const changes: RegressionTestChange[] = [];

  for (const scenario of current.generatedTests) {
    const candidates = baseline.generatedTests
      .filter((candidate) => unmatchedBaseline.has(candidate.id))
      .map((candidate) => ({ candidate, score: scenarioScore(scenario, candidate) }))
      .sort((left, right) => right.score - left.score);
    const best = candidates[0];
    const match = best && best.score >= .6 ? best.candidate : undefined;
    if (match) unmatchedBaseline.delete(match.id);
    const currentRun = currentRuns.get(scenario.id);
    const baselineRun = match ? baselineRuns.get(match.id) : undefined;
    changes.push({
      key: `${scenario.id}:${match?.id || "added"}`, status: state(currentRun?.status, baselineRun?.status, !match),
      title: scenario.title, category: scenario.category, currentScenarioId: scenario.id, baselineScenarioId: match?.id,
      currentRunStatus: currentRun?.status, baselineRunStatus: baselineRun?.status
    });
  }

  for (const scenario of baseline.generatedTests.filter((test) => unmatchedBaseline.has(test.id))) {
    changes.push({
      key: `removed:${scenario.id}`, status: "removed", title: scenario.title, category: scenario.category,
      baselineScenarioId: scenario.id, baselineRunStatus: baselineRuns.get(scenario.id)?.status
    });
  }

  const currentSuccessRate = successRate(currentRuns);
  const baselineSuccessRate = successRate(baselineRuns);
  const count = (status: RegressionChangeStatus) => changes.filter((change) => change.status === status).length;
  return {
    currentAnalysisId: current.analysis.id, baselineAnalysisId: baseline.analysis.id,
    currentCreatedAt: current.analysis.createdAt, baselineCreatedAt: baseline.analysis.createdAt,
    currentSuccessRate, baselineSuccessRate, successRateDelta: currentSuccessRate - baselineSuccessRate,
    newFailureCount: count("new_failure"), persistentFailureCount: count("persistent_failure"), resolvedCount: count("resolved"),
    stableSuccessCount: count("stable_success"), addedScenarioCount: count("added"), removedScenarioCount: count("removed"),
    unverifiedCount: count("unverified"), changes
  };
}
