import { describe, expect, it } from "vitest";
import type { QaDefect } from "../../shared/types/analysis";
import { filterQaDefects, summarizeQaDefects } from "../../shared/utils/qa-defect-dashboard";

const makeDefect = (overrides: Partial<QaDefect>): QaDefect => ({
  id: "defect-1", analysisId: "analysis-1", sourceRunId: "run-1", scenarioId: "scenario-1",
  scenarioTitle: "로그인 확인", targetUrl: "https://example.com/login", title: "로그인 실패", description: "버튼 클릭 후 오류",
  status: "new", severity: "high", priority: "P1", assignee: "qa@example.com", failureSummary: "버튼을 찾지 못함",
  failedStepOrders: [2], screenshotArtifactIds: [], notes: [], history: [], createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z",
  ...overrides
});

describe("qa defect dashboard", () => {
  const defects = [
    makeDefect({ id: "new", status: "new", severity: "critical", assignee: "민수" }),
    makeDefect({ id: "retry", status: "revalidation_requested", title: "결제 재검증", targetUrl: "https://shop.example.com", assignee: "지수" }),
    makeDefect({ id: "done", status: "resolved", severity: "low", title: "해결된 결함", assignee: "민수" })
  ];

  it("검색어와 상태·심각도·담당자 필터를 함께 적용한다", () => {
    expect(filterQaDefects(defects, { query: "결제", status: "revalidation_requested", severity: "all", assignee: "지수" }).map((item) => item.id)).toEqual(["retry"]);
    expect(filterQaDefects(defects, { query: "example.com/login", status: "all", severity: "critical", assignee: "all" }).map((item) => item.id)).toEqual(["new"]);
  });

  it("미해결·치명적·재검증 대기 건수를 요약한다", () => {
    expect(summarizeQaDefects(defects)).toEqual({ total: 3, unresolved: 2, critical: 1, revalidationRequested: 1 });
  });
});
