import type { QaDefect, QaDefectSeverity, QaDefectStatus } from "../types/analysis";

export interface QaDefectFilters {
  query: string;
  status: "all" | QaDefectStatus;
  severity: "all" | QaDefectSeverity;
  assignee: "all" | string;
}

export function filterQaDefects(defects: QaDefect[], filters: QaDefectFilters): QaDefect[] {
  const query = filters.query.trim().toLocaleLowerCase("ko-KR");
  return defects.filter((defect) => {
    const searchable = [defect.title, defect.scenarioTitle, defect.targetUrl, defect.assignee, defect.description, defect.failureSummary].join(" ").toLocaleLowerCase("ko-KR");
    return (!query || searchable.includes(query))
      && (filters.status === "all" || defect.status === filters.status)
      && (filters.severity === "all" || defect.severity === filters.severity)
      && (filters.assignee === "all" || defect.assignee === filters.assignee);
  });
}

export function summarizeQaDefects(defects: QaDefect[]) {
  return {
    total: defects.length,
    unresolved: defects.filter((defect) => !["resolved", "deferred"].includes(defect.status)).length,
    critical: defects.filter((defect) => defect.severity === "critical" && defect.status !== "resolved").length,
    revalidationRequested: defects.filter((defect) => defect.status === "revalidation_requested").length
  };
}
