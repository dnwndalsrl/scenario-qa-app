import type { AiPageAnalysis, AnalysisSummary, AutomatedTestRun, GeneratedTestScenario, PageSnapshot } from "../../../shared/types/analysis";

export function buildSummary(snapshot: PageSnapshot, pageAnalysis: AiPageAnalysis, tests: GeneratedTestScenario[], runs: AutomatedTestRun[]): AnalysisSummary {
  const successCount = runs.filter((run) => run.status === "success").length; const failedCount = runs.filter((run) => run.status === "failed").length;
  const blockedCount = runs.filter((run) => run.status === "blocked").length; const errorCount = runs.filter((run) => run.status === "error").length;
  const consoleErrorCount = snapshot.consoleMessages.filter((item) => item.type === "error" || item.type === "pageerror").length;
  const networkIssueCount = snapshot.networkIssues.length; const criticalIssueCount = pageAnalysis.risks.filter((risk) => risk.severity === "high").length + failedCount + errorCount;
  const warningCount = pageAnalysis.risks.filter((risk) => risk.severity !== "high").length + consoleErrorCount + networkIssueCount;
  return {
    pageType: pageAnalysis.pageType, pagePurpose: pageAnalysis.pagePurpose, discoveredElementCount: snapshot.elements.length, discoveredFunctionCount: pageAnalysis.primaryFunctions.length,
    generatedTestCount: tests.length, executedTestCount: runs.filter((run) => run.status !== "blocked").length, successCount, failedCount, blockedCount, errorCount,
    consoleErrorCount, networkIssueCount, criticalIssueCount, warningCount,
    overallStatus: criticalIssueCount > 0 ? "failed" : warningCount > 0 || blockedCount > 0 ? "passed_with_warnings" : "passed"
  };
}
