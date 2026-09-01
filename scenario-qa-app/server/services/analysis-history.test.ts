import { describe, expect, it } from "vitest";
import type { SiteAnalysis } from "../../shared/types/analysis";
import { filterAnalysisHistory, groupAnalysisHistory } from "../../shared/utils/analysis-history";
import { formatKoreanDateTime } from "../../utils/date-format";

const item = (id: string, url: string, status: SiteAnalysis["status"]): SiteAnalysis => ({
  id, targetUrl: url, normalizedUrl: url, status, processStage: "report_complete", progress: 100, currentMessage: "완료",
  options: { mode: "single_page", testMode: "read_only", autoRunSafeTests: true, viewport: { width: 1440, height: 900 }, timeoutMs: 30000, maxPages: 1, maxDepth: 0, includeQueryUrls: false, respectNoFollow: true },
  pageIds: [], pageAnalysisIds: [], generatedTestIds: [], testRunIds: [], createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z"
});

describe("analysis history UI helpers", () => {
  const items = [item("1", "https://a.example/", "completed"), item("2", "https://a.example/", "failed"), item("3", "https://b.example/", "launching_browser")];

  it("URL 검색과 사용자 상태 필터를 적용한다", () => {
    expect(filterAnalysisHistory(items, "a.example", "failed").map((value) => value.id)).toEqual(["2"]);
    expect(filterAnalysisHistory(items, "", "active").map((value) => value.id)).toEqual(["3"]);
  });

  it("같은 URL의 분석을 한 그룹으로 묶는다", () => {
    expect(groupAnalysisHistory(items).map((group) => [group.url, group.analyses.length])).toEqual([["https://a.example/", 2], ["https://b.example/", 1]]);
  });

  it("동일한 시각 표현을 서울 시간대로 고정한다", () => {
    expect(formatKoreanDateTime("2026-08-27T00:00:00.000Z")).toBe(formatKoreanDateTime("2026-08-27T09:00:00+09:00"));
  });
});
