import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { UiAudit } from "../../shared/types/ui-audit";
import { buildUiAuditWorkbook, uiAuditWorkbookFileName } from "./ui-audit-workbook.service";

function fixture(): UiAudit {
  return {
    id: "audit-1", name: "홈 화면 점검", targetUrl: "https://example.com", normalizedUrl: "https://example.com/",
    status: "completed", currentMessage: "완료", viewport: { preset: "desktop", label: "데스크톱", width: 1440, height: 900 },
    hasReference: true, createdAt: "2026-09-07T01:00:00.000Z", completedAt: "2026-09-07T01:02:00.000Z",
    summary: { issueCount: 2, highCount: 1, mediumCount: 1, lowCount: 0, screenshotCount: 1, comparison: { status: "review", differencePercent: 12.5, meanDifferencePercent: 3.2, dimensionMismatch: false, referenceWidth: 1440, referenceHeight: 900, actualWidth: 1440, actualHeight: 900 } },
    issues: [
      { id: "issue-1", rule: "element_overlap", severity: "high", title: "버튼 겹침", message: "버튼이 가려집니다.", selector: "#submit", state: "scroll_50", actual: { overlapPercent: 42 }, artifactSourceId: "shot-1" },
      { id: "issue-2", rule: "small_target", severity: "medium", title: "클릭 영역 작음", message: "클릭 영역이 작습니다.", selector: ".icon", state: "initial", actual: {}, artifactSourceId: "shot-1" },
    ],
    artifacts: [{ id: "shot-1", state: "initial", width: 1440, height: 900, signedUrl: "https://signed.example/screenshot.png" }],
    reviews: [{ rule: "element_overlap", status: "fix_required", note: "다음 배포에 수정", updatedAt: "2026-09-07T02:00:00.000Z" }],
  };
}

describe("UI audit Excel export", () => {
  it("creates summary, improvement, and evidence sheets with review data", async () => {
    const bytes = await buildUiAuditWorkbook(fixture());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as any);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["요약", "개선 항목", "상세 증거"]);
    const summary = JSON.stringify(workbook.getWorksheet("요약")!.getSheetValues());
    expect(summary).toContain("12.5%");
    expect(summary).toContain("수정 필요 그룹 수");
    const improvements = JSON.stringify(workbook.getWorksheet("개선 항목")!.getSheetValues());
    expect(improvements).toContain("수정 필요");
    expect(improvements).toContain("다음 배포에 수정");
    expect(improvements).toContain("미검토");
    const evidence = JSON.stringify(workbook.getWorksheet("상세 증거")!.getSheetValues());
    expect(evidence).toContain("#submit");
    expect(evidence).toContain("overlapPercent");
    expect(evidence).toContain("https://signed.example/screenshot.png");
  });

  it("creates the required safe filename", () => {
    expect(uiAuditWorkbookFileName(fixture())).toBe("ui-qa-report-홈-화면-점검-20260907.xlsx");
  });
});
