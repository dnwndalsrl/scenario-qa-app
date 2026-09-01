import type { SiteAnalysis } from "../types/analysis";

export type AnalysisHistoryStatus = "all" | "completed" | "failed" | "active";

export function filterAnalysisHistory(items: SiteAnalysis[], query: string, status: AnalysisHistoryStatus): SiteAnalysis[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  return items.filter((item) => {
    const matchesQuery = !normalizedQuery || item.normalizedUrl.toLocaleLowerCase("ko-KR").includes(normalizedQuery);
    const matchesStatus = status === "all"
      || (status === "completed" && ["completed", "partially_completed"].includes(item.status))
      || (status === "failed" && item.status === "failed")
      || (status === "active" && !["completed", "partially_completed", "failed"].includes(item.status));
    return matchesQuery && matchesStatus;
  });
}

export function groupAnalysisHistory(items: SiteAnalysis[]) {
  const groups = new Map<string, SiteAnalysis[]>();
  for (const item of items) groups.set(item.normalizedUrl, [...(groups.get(item.normalizedUrl) || []), item]);
  return [...groups].map(([url, analyses]) => ({ url, analyses }));
}
