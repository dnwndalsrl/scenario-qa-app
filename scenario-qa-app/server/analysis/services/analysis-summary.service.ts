import type { AiPageAnalysis, AnalysisSummary, AutomatedTestRun, GeneratedTestScenario, PageSnapshot } from "../../../shared/types/analysis";
import { latestTestRuns } from "../../../shared/utils/test-run-history";

export function buildSummary(snapshot: PageSnapshot, pageAnalysis: AiPageAnalysis, tests: GeneratedTestScenario[], runs: AutomatedTestRun[]): AnalysisSummary {
  const successCount = runs.filter((run) => run.status === "success").length;
  const failedCount = runs.filter((run) => run.status === "failed" && (!run.failureKind || run.failureKind === "product_defect")).length;
  const blockedCount = runs.filter((run) => run.status === "blocked").length;
  const errorCount = runs.filter((run) => run.failureKind === "environment_error" || (run.status === "error" && !run.failureKind)).length;
  const inconclusiveCount = runs.filter((run) => ["automation_limit", "inconclusive"].includes(run.failureKind || "")).length;
  const consoleErrorCount = snapshot.consoleMessages.filter((item) => item.type === "error" || item.type === "pageerror").length;
  const networkIssueCount = snapshot.networkIssues.length; const criticalIssueCount = pageAnalysis.risks.filter((risk) => risk.severity === "high").length + failedCount + errorCount;
  const warningCount = pageAnalysis.risks.filter((risk) => risk.severity !== "high").length + consoleErrorCount + networkIssueCount + inconclusiveCount;
  return {
    pageType: pageAnalysis.pageType, pagePurpose: pageAnalysis.pagePurpose, discoveredElementCount: snapshot.elements.length, discoveredFunctionCount: pageAnalysis.primaryFunctions.length,
    generatedTestCount: tests.length, executedTestCount: runs.filter((run) => run.status !== "blocked").length, successCount, failedCount, blockedCount, errorCount, inconclusiveCount,
    consoleErrorCount, networkIssueCount, criticalIssueCount, warningCount,
    overallStatus: errorCount > 0 ? "analysis_error" : criticalIssueCount > 0 ? "failed" : warningCount > 0 || blockedCount > 0 ? "passed_with_warnings" : "passed"
  };
}

export function buildCurrentSummary(snapshot: PageSnapshot, pageAnalysis: AiPageAnalysis, tests: GeneratedTestScenario[], runs: AutomatedTestRun[]): AnalysisSummary {
  return buildSummary(snapshot, pageAnalysis, tests, latestTestRuns(runs));
}
