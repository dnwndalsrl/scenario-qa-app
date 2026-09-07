import ExcelJS from "exceljs";
import type { UiAudit, UiAuditReviewStatus, UiAuditSeverity } from "../../shared/types/ui-audit";
import { countUiAuditReviews, uiAuditReviewStatusFor } from "../../shared/utils/ui-audit-review";
import { groupUiAuditIssues, UI_AUDIT_RULE_GUIDANCE } from "../../shared/utils/ui-audit-remediation";

const severityLabels: Record<UiAuditSeverity, string> = { high: "높음", medium: "보통", low: "낮음" };
const reviewLabels: Record<UiAuditReviewStatus, string> = { unreviewed: "미검토", fix_required: "수정 필요", false_positive: "오탐", deferred: "보류" };

function safeText(value: unknown): string {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  const clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return /^[=+\-@]/.test(clean) ? `'${clean}` : clean;
}

function styleTable(sheet: ExcelJS.Worksheet, widths: number[]) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.height = 24;
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: widths.length } };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true };
  });
}

export async function buildUiAuditWorkbook(audit: UiAudit): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Probe QA";
  const groups = groupUiAuditIssues(audit.issues);
  const reviewCounts = countUiAuditReviews(groups.map((group) => group.rule), audit.reviews || []);
  const summary = audit.summary || {
    issueCount: audit.issues.length,
    highCount: audit.issues.filter((issue) => issue.severity === "high").length,
    mediumCount: audit.issues.filter((issue) => issue.severity === "medium").length,
    lowCount: audit.issues.filter((issue) => issue.severity === "low").length,
    screenshotCount: audit.artifacts.length,
  };

  const overview = workbook.addWorksheet("요약");
  overview.addRow(["항목", "내용"]);
  [
    ["검사 이름", audit.name], ["대상 URL", audit.targetUrl], ["실행 상태", audit.status],
    ["화면 크기", `${audit.viewport.label} ${audit.viewport.width}×${audit.viewport.height}`],
    ["실행 일시", audit.completedAt || audit.createdAt], ["전체 문제 수", summary.issueCount],
    ["높음 문제 수", summary.highCount], ["보통 문제 수", summary.mediumCount], ["낮음 문제 수", summary.lowCount],
    ["미검토 그룹 수", reviewCounts.unreviewed], ["수정 필요 그룹 수", reviewCounts.fix_required],
    ["오탐 그룹 수", reviewCounts.false_positive], ["보류 그룹 수", reviewCounts.deferred],
    ["디자인 비교 여부", audit.hasReference ? "사용" : "없음"],
    ["디자인 차이율", summary.comparison ? `${summary.comparison.differencePercent}%` : ""],
  ].forEach(([label, value]) => overview.addRow([label, typeof value === "string" ? safeText(value) : value]));
  styleTable(overview, [24, 72]);

  const improvements = workbook.addWorksheet("개선 항목");
  improvements.addRow(["번호", "문제 유형", "심각도", "영향 요소 수", "확인 화면 수", "발생 이유", "권장 수정", "확인 기준", "사용자 판정", "판정 메모", "판정 수정 일시"]);
  groups.forEach((group, index) => {
    const guidance = UI_AUDIT_RULE_GUIDANCE[group.rule];
    const review = (audit.reviews || []).find((item) => item.rule === group.rule);
    improvements.addRow([index + 1, guidance.label, severityLabels[group.severity], group.affectedCount, group.stateCount, safeText(guidance.reason), safeText(guidance.recommendation), safeText(guidance.standard), reviewLabels[uiAuditReviewStatusFor(audit.reviews || [], group.rule)], safeText(review?.note), review?.updatedAt || ""]);
  });
  styleTable(improvements, [8, 18, 10, 14, 14, 42, 42, 36, 14, 32, 22]);

  const evidence = workbook.addWorksheet("상세 증거");
  evidence.addRow(["개선 항목 번호", "문제 유형", "심각도", "문제 제목", "설명", "화면 상태", "요소 선택자", "측정값", "근거 스크린샷 링크"]);
  groups.forEach((group, index) => group.issues.forEach((issue) => {
    const artifact = audit.artifacts.find((item) => item.id === issue.artifactSourceId);
    evidence.addRow([index + 1, UI_AUDIT_RULE_GUIDANCE[issue.rule].label, severityLabels[issue.severity], safeText(issue.title), safeText(issue.message), safeText(issue.state), safeText(issue.selector), safeText(issue.actual), artifact?.signedUrl || ""]);
  }));
  styleTable(evidence, [16, 18, 10, 28, 46, 18, 42, 38, 64]);

  return await workbook.xlsx.writeBuffer() as unknown as Buffer;
}

export function uiAuditWorkbookFileName(audit: UiAudit): string {
  const name = audit.name.normalize("NFKC").replace(/[^0-9A-Za-z가-힣_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "ui-audit";
  const date = (audit.completedAt || audit.createdAt).slice(0, 10).replaceAll("-", "");
  return `ui-qa-report-${name}-${date}.xlsx`;
}
