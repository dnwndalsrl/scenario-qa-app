import type { UiAuditHistoryItem } from "../types/ui-audit";
import type { AnalysisHistoryStatus } from "./analysis-history";

export function filterUiAuditHistory(items: UiAuditHistoryItem[], query: string, status: AnalysisHistoryStatus): UiAuditHistoryItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  return items.filter((item) => {
    const matchesQuery = !normalizedQuery || item.normalizedUrl.toLocaleLowerCase("ko-KR").includes(normalizedQuery);
    const matchesStatus = status === "all"
      || (status === "completed" && item.status === "completed")
      || (status === "failed" && item.status === "failed")
      || (status === "active" && !["completed", "failed"].includes(item.status));
    return matchesQuery && matchesStatus;
  });
}

export function groupUiAuditHistory(items: UiAuditHistoryItem[]) {
  const groups = new Map<string, UiAuditHistoryItem[]>();
  for (const item of items) groups.set(item.normalizedUrl, [...(groups.get(item.normalizedUrl) || []), item]);
  return [...groups].map(([url, audits]) => ({ url, audits }));
}

