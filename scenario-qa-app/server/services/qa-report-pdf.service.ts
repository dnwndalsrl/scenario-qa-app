import PDFDocument from "pdfkit";
import type { AnalysisDetail, AutomatedTestRun, GeneratedTestScenario, QaDefect } from "../../shared/types/analysis";
import { buildRequirementCoverage } from "../../shared/utils/requirement-coverage";
import { latestTestRuns } from "../../shared/utils/test-run-history";
import { uiLabel } from "../../utils/ui-label";

export interface QaReportScreenshot { id: string; label: string; data: Buffer }
export interface QaReportFonts { regular: Buffer; bold: Buffer }

const ink = "#17223B";
const muted = "#66758A";
const line = "#D9E1EC";
const soft = "#F5F7FA";
const success = "#18765A";
const danger = "#B42318";
const warning = "#9A6700";

function clean(value: unknown, max = 2000): string {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function runResult(run?: AutomatedTestRun): string {
  if (!run) return "미실행";
  return uiLabel(run.status);
}

function expectedResult(test: GeneratedTestScenario): string {
  return clean(test.steps.filter((step) => step.action.startsWith("assert_")).map((step) => step.expected || step.description).filter(Boolean).join(" / ") || "명시된 검증 단계 없음", 700);
}

function actualResult(run?: AutomatedTestRun): string {
  if (!run) return "실행 결과 없음";
  return clean(run.stepResults.map((step) => step.actual).filter(Boolean).join(" / ") || run.error?.message || runResult(run), 700);
}

function failureResult(run?: AutomatedTestRun): string {
  if (!run) return "";
  return clean(run.error?.message || run.stepResults.filter((step) => ["failed", "error", "blocked"].includes(step.status)).map((step) => step.errorMessage || step.actual || step.description).filter(Boolean).join(" / "), 700);
}

function reportStatus(detail: AnalysisDetail, runs: AutomatedTestRun[]): { label: string; color: string } {
  const status = detail.analysis.summary?.overallStatus;
  if (status) return { label: uiLabel(status), color: status === "failed" || status === "analysis_error" ? danger : status === "passed" ? success : warning };
  if (runs.some((run) => run.status === "failed" || run.status === "error")) return { label: "실패", color: danger };
  if (runs.length && runs.every((run) => run.status === "success")) return { label: "통과", color: success };
  return { label: "확인 필요", color: warning };
}

function pageHeader(doc: PDFKit.PDFDocument) {
  doc.font("Bold").fontSize(9).fillColor(ink).text("PROBE QA", 42, 28, { continued: true });
  doc.font("Regular").fillColor(muted).text("  최종 QA 결과보고서");
  doc.moveTo(42, 45).lineTo(doc.page.width - 42, 45).strokeColor(line).lineWidth(.7).stroke();
  doc.y = 58;
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height <= doc.page.height - 58) return;
  doc.addPage();
  pageHeader(doc);
}

function sectionTitle(doc: PDFKit.PDFDocument, number: number, title: string, description?: string) {
  ensureSpace(doc, description ? 58 : 42);
  doc.moveDown(.55);
  doc.font("Bold").fontSize(9).fillColor(muted).text(String(number).padStart(2, "0"), 42, doc.y + 4, { width: 24 });
  doc.font("Bold").fontSize(16).fillColor(ink).text(title, 72, doc.y, { width: doc.page.width - 114 });
  if (description) doc.moveDown(.25).font("Regular").fontSize(8.5).fillColor(muted).text(clean(description), 72, doc.y, { width: doc.page.width - 114, lineGap: 2 });
  doc.moveDown(.6);
}

function card(doc: PDFKit.PDFDocument, title: string, lines: Array<{ label: string; value: string; color?: string }>) {
  doc.font("Bold").fontSize(10.5);
  const lineHeights = lines.map((item) => Math.max(16, doc.font("Regular").fontSize(8.5).heightOfString(`${item.label}  ${item.value}`, { width: 455, lineGap: 2 })));
  const height = 30 + lineHeights.reduce((sum, value) => sum + value, 0) + 10;
  ensureSpace(doc, height + 10);
  const y = doc.y;
  doc.roundedRect(42, y, doc.page.width - 84, height, 7).fillAndStroke(soft, line);
  doc.font("Bold").fontSize(10.5).fillColor(ink).text(clean(title, 300), 56, y + 13, { width: doc.page.width - 112 });
  let rowY = y + 35;
  lines.forEach((item, index) => {
    doc.font("Bold").fontSize(8).fillColor(muted).text(item.label, 56, rowY, { width: 62 });
    doc.font("Regular").fontSize(8.5).fillColor(item.color || ink).text(clean(item.value, 1000) || "-", 120, rowY, { width: doc.page.width - 176, lineGap: 2 });
    rowY += lineHeights[index] || 16;
  });
  doc.y = y + height + 8;
}

function metric(doc: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, value: string, color = ink) {
  doc.roundedRect(x, y, width, 55, 7).fillAndStroke(soft, line);
  doc.font("Regular").fontSize(8).fillColor(muted).text(label, x + 10, y + 10, { width: width - 20 });
  doc.font("Bold").fontSize(16).fillColor(color).text(value, x + 10, y + 27, { width: width - 20 });
}

function addSummary(doc: PDFKit.PDFDocument, detail: AnalysisDetail, latestRuns: AutomatedTestRun[]) {
  const status = reportStatus(detail, latestRuns);
  const successCount = latestRuns.filter((run) => run.status === "success").length;
  const failureCount = latestRuns.filter((run) => run.status === "failed" || run.status === "error").length;
  const blockedCount = latestRuns.filter((run) => run.status === "blocked").length;
  const y = doc.y;
  const width = (doc.page.width - 96) / 4;
  metric(doc, 42, y, width, "종합 판정", status.label, status.color);
  metric(doc, 46 + width, y, width, "검증 성공", `${successCount}건`, success);
  metric(doc, 50 + width * 2, y, width, "실패·오류", `${failureCount}건`, failureCount ? danger : ink);
  metric(doc, 54 + width * 3, y, width, "차단·미실행", `${blockedCount + Math.max(0, detail.generatedTests.length - latestRuns.length)}건`, warning);
  doc.y = y + 68;
  card(doc, "분석 기본 정보", [
    { label: "대상", value: detail.analysis.normalizedUrl },
    { label: "분석 ID", value: detail.analysis.id },
    { label: "완료 일시", value: formatDate(detail.analysis.completedAt || detail.analysis.updatedAt) },
    { label: "범위", value: detail.analysis.options.mode === "site_crawl" ? `사이트 주요 페이지 ${detail.pages.length}개` : "현재 페이지 1개" }
  ]);
}

function addRequirements(doc: PDFKit.PDFDocument, detail: AnalysisDetail) {
  const requirements = detail.documentAnalysis?.requirements || [];
  if (!requirements.length) {
    card(doc, "요구사항 문서 없음", [{ label: "안내", value: "선택 문서 없이 페이지에서 수집한 정보로 분석했습니다." }]);
    return;
  }
  const coverage = buildRequirementCoverage(requirements, detail.generatedTests, detail.testRuns);
  coverage.forEach((item) => card(doc, `${item.requirement.id}  ${item.requirement.title}`, [
    { label: "우선순위", value: ({ high: "높음", medium: "보통", low: "낮음" } as const)[item.requirement.priority] },
    { label: "기대 동작", value: item.requirement.expectedBehavior },
    { label: "연결 테스트", value: item.tests.map((test) => test.title).join(", ") || "연결된 테스트 없음" },
    { label: "검증 상태", value: ({ uncovered: "테스트 없음", not_run: "미실행", running: "실행 중", passed: "검증 성공", failed: "검증 실패" } as const)[item.status], color: item.status === "passed" ? success : item.status === "failed" ? danger : warning }
  ]));
}

function addTests(doc: PDFKit.PDFDocument, detail: AnalysisDetail, latestRuns: AutomatedTestRun[]) {
  const latestByScenario = new Map(latestRuns.map((run) => [run.scenarioId, run]));
  detail.generatedTests.forEach((test, index) => {
    const run = latestByScenario.get(test.id);
    const resultColor = run?.status === "success" ? success : run && ["failed", "error"].includes(run.status) ? danger : warning;
    const lines = [
      { label: "구분", value: `${uiLabel(test.category)} · ${uiLabel(test.safetyLevel)} · ${test.revision || 1}판` },
      { label: "예상", value: expectedResult(test) },
      { label: "실제", value: actualResult(run) },
      { label: "판정", value: runResult(run), color: resultColor }
    ];
    const failure = failureResult(run);
    if (failure) lines.push({ label: "실패 원인", value: failure, color: danger });
    if (run?.review) lines.push({ label: "사용자 판정", value: `${uiLabel(run.review.classification)}${run.review.note ? ` · ${run.review.note}` : ""}` });
    card(doc, `${String(index + 1).padStart(2, "0")}  ${test.title}`, lines);
  });
}

function addDefects(doc: PDFKit.PDFDocument, defects: QaDefect[]) {
  if (!defects.length) {
    card(doc, "등록된 결함 없음", [{ label: "결과", value: "현재 분석에 등록된 결함이 없습니다.", color: success }]);
    return;
  }
  defects.forEach((defect) => card(doc, defect.title, [
    { label: "상태", value: `${uiLabel(defect.status)} · ${defect.priority} · ${uiLabel(defect.severity)}`, color: defect.status === "resolved" ? success : danger },
    { label: "시나리오", value: defect.scenarioTitle },
    { label: "실패 근거", value: defect.failureSummary },
    { label: "담당자", value: defect.assignee || "미지정" }
  ]));
}

function addScreenshots(doc: PDFKit.PDFDocument, screenshots: QaReportScreenshot[]) {
  if (!screenshots.length) {
    card(doc, "스크린샷 근거 없음", [{ label: "안내", value: "실패 실행에서 저장된 스크린샷이 없습니다." }]);
    return;
  }
  screenshots.forEach((screenshot, index) => {
    ensureSpace(doc, 290);
    doc.font("Bold").fontSize(10).fillColor(ink).text(`${index + 1}. ${clean(screenshot.label, 180)}`, 42, doc.y, { width: doc.page.width - 84 });
    const y = doc.y + 8;
    doc.roundedRect(42, y, doc.page.width - 84, 250, 7).fillAndStroke("#FFFFFF", line);
    try {
      doc.image(screenshot.data, 50, y + 8, { fit: [doc.page.width - 100, 234], align: "center", valign: "center" });
    } catch {
      doc.font("Regular").fontSize(9).fillColor(muted).text("지원하지 않는 이미지 형식으로 미리보기를 포함하지 못했습니다.", 58, y + 112, { width: doc.page.width - 116, align: "center" });
    }
    doc.y = y + 264;
  });
}

function addLimitations(doc: PDFKit.PDFDocument, detail: AnalysisDetail) {
  const limitations = [...(detail.documentAnalysis?.limitations || []), ...(detail.pageAnalysis?.limitations || []), ...(detail.siteAnalysis?.limitations || [])];
  const risks = [...(detail.pageAnalysis?.risks || []), ...(detail.siteAnalysis?.risks || [])];
  if (!limitations.length && !risks.length) {
    card(doc, "추가 확인 항목 없음", [{ label: "결과", value: "분석 결과에 별도 한계 또는 위험 항목이 기록되지 않았습니다." }]);
    return;
  }
  limitations.forEach((item, index) => card(doc, `분석 한계 ${index + 1}`, [{ label: "내용", value: item, color: warning }]));
  risks.forEach((item) => card(doc, item.title, [{ label: "심각도", value: uiLabel(item.severity) }, { label: "내용", value: item.description, color: warning }]));
}

function addFooters(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.moveTo(42, doc.page.height - 40).lineTo(doc.page.width - 42, doc.page.height - 40).strokeColor(line).lineWidth(.6).stroke();
    doc.font("Regular").fontSize(7.5).fillColor(muted).text("Probe QA · 자동 수집 결과는 사용자 검토와 함께 사용하세요.", 42, doc.page.height - 31, { width: 390, lineBreak: false });
    doc.text(`${index + 1} / ${range.count}`, doc.page.width - 92, doc.page.height - 31, { width: 50, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
}

export async function buildQaReportPdf(detail: AnalysisDetail, defects: QaDefect[], screenshots: QaReportScreenshot[], fonts: QaReportFonts): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 50, right: 42, bottom: 55, left: 42 }, bufferPages: true, info: { Title: `Probe QA - ${detail.analysis.normalizedUrl}`, Author: "Probe QA", Subject: "최종 QA 결과보고서" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.registerFont("Regular", fonts.regular);
    doc.registerFont("Bold", fonts.bold);
    doc.font("Regular");

    doc.font("Bold").fontSize(10).fillColor(muted).text("PROBE QA · FINAL REPORT");
    doc.moveDown(.8).fontSize(27).fillColor(ink).text("최종 QA 결과보고서", { lineGap: 3 });
    doc.moveDown(.4).font("Regular").fontSize(10).fillColor(muted).text(clean(detail.analysis.normalizedUrl, 500), { link: detail.analysis.normalizedUrl, underline: true });
    doc.moveDown(1.2);

    const latestRuns = latestTestRuns(detail.testRuns);
    sectionTitle(doc, 1, "결과 요약", "분석 범위와 최신 실행 결과를 기준으로 집계했습니다.");
    addSummary(doc, detail, latestRuns);
    sectionTitle(doc, 2, "요구사항 추적", "선택 문서의 요구사항과 연결된 테스트 결과입니다.");
    addRequirements(doc, detail);
    sectionTitle(doc, 3, "테스트 실행 결과", "각 시나리오의 예상 결과와 최신 실제 결과를 함께 표시합니다.");
    addTests(doc, detail, latestRuns);
    sectionTitle(doc, 4, "결함 현황", "사용자가 등록한 결함과 현재 처리 상태입니다.");
    addDefects(doc, defects);
    sectionTitle(doc, 5, "실패 스크린샷", "실패 실행에서 수집된 화면 근거이며 최대 6장까지 포함합니다.");
    addScreenshots(doc, screenshots.slice(0, 6));
    sectionTitle(doc, 6, "확인 필요 항목", "자동 분석의 한계와 추가 검토가 필요한 위험 항목입니다.");
    addLimitations(doc, detail);
    addFooters(doc);
    doc.end();
  });
}

export function qaReportPdfFileName(detail: AnalysisDetail): string {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `probe-qa-final-report-${day}-${detail.analysis.id.slice(0, 8)}.pdf`;
}
