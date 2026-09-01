import ExcelJS from "exceljs";
import type { AnalysisDetail, AutomatedTestRun, GeneratedTestScenario, QaDefect } from "../../shared/types/analysis";
import { buildRequirementCoverage, type RequirementCoverageStatus } from "../../shared/utils/requirement-coverage";
import { latestTestRuns } from "../../shared/utils/test-run-history";
import { uiLabel } from "../../utils/ui-label";

const headerFill = "24344D";
const subHeaderFill = "E8EEF5";
const borderColor = "CBD5E1";
const statusLabels = { uncovered: "테스트 없음", not_run: "미실행", running: "실행 중", passed: "검증 성공", failed: "검증 실패" } as const;
const priorityLabels = { high: "높음", medium: "보통", low: "낮음" } as const;

function safeText(value: unknown): string {
  const text = String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 32700);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function latestRunMap(runs: AutomatedTestRun[]) { return new Map(latestTestRuns(runs).map((run) => [run.scenarioId, run])); }
function assertions(test: GeneratedTestScenario) { return test.steps.filter((step) => step.action.startsWith("assert_")).map((step) => step.expected || step.description); }
function latestTime(runs: AutomatedTestRun[]): Date | string {
  const value = runs.map((run) => run.completedAt || run.startedAt).filter((item): item is string => Boolean(item)).sort().at(-1);
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? safeText(value) : parsed;
}
function runActual(run: AutomatedTestRun) { return run.stepResults.map((step) => step.actual).filter(Boolean).join(" · "); }
function runFailure(run: AutomatedTestRun) {
  return run.error?.message || run.stepResults.filter((step) => ["failed", "error", "blocked"].includes(step.status)).map((step) => step.errorMessage || step.actual || step.description).filter(Boolean).join(" · ");
}
function relatedDefects(tests: GeneratedTestScenario[], runs: AutomatedTestRun[], defects: QaDefect[]) {
  const testIds = new Set(tests.map((test) => test.id));
  const defectIds = new Set(runs.map((run) => run.review?.defectId).filter((id): id is string => Boolean(id)));
  return defects.filter((defect) => testIds.has(defect.scenarioId) || defectIds.has(defect.id));
}
function recommendation(status: RequirementCoverageStatus) {
  return { uncovered: "테스트 시나리오 생성", not_run: "연결된 테스트 실행", running: "실행 완료 확인", failed: "실패 결과 판정 및 결함 확인", passed: "검증 완료" }[status];
}

function title(sheet: ExcelJS.Worksheet, text: string, endColumn: number) {
  sheet.mergeCells(1, 1, 1, endColumn);
  const cell = sheet.getCell(1, 1);
  cell.value = text;
  cell.font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerFill}` } };
  cell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 36;
}

function header(sheet: ExcelJS.Worksheet, rowNumber: number, labels: string[], widths: number[]) {
  const row = sheet.getRow(rowNumber);
  row.values = labels;
  row.height = 30;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerFill}` } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.autoFilter = { from: { row: rowNumber, column: 1 }, to: { row: rowNumber, column: labels.length } };
  sheet.views = [{ state: "frozen", ySplit: rowNumber, showGridLines: false }];
}

function bodyStyle(sheet: ExcelJS.Worksheet, startRow: number, endColumn: number, statusColumn: number) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return;
    row.height = 48;
    for (let column = 1; column <= endColumn; column++) {
      const cell = row.getCell(column);
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: `FF${borderColor}` } } };
    }
    const status = String(row.getCell(statusColumn).value || "");
    const fill = status === "검증 성공" ? "E5F4EE" : status === "검증 실패" ? "FBE9E7" : status === "실행 중" ? "FFF4D8" : "F1F4F8";
    row.getCell(statusColumn).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${fill}` } };
    row.getCell(statusColumn).font = { bold: true };
  });
}

function addTraceabilitySheet(workbook: ExcelJS.Workbook, detail: AnalysisDetail, defects: QaDefect[]) {
  const sheet = workbook.addWorksheet("요구사항 추적표", { properties: { tabColor: { argb: `FF${headerFill}` } } });
  const coverage = buildRequirementCoverage(detail.documentAnalysis?.requirements || [], detail.generatedTests, detail.testRuns);
  const latest = latestRunMap(detail.testRuns);
  const dataStart = 6;
  const dataEnd = Math.max(dataStart, dataStart + coverage.length - 1);
  title(sheet, "Probe QA 요구사항 추적표 (RTM)", 18);
  sheet.getCell("A2").value = "대상 URL"; sheet.getCell("B2").value = safeText(detail.analysis.normalizedUrl);
  sheet.getCell("D2").value = "분석 ID"; sheet.getCell("E2").value = safeText(detail.analysis.id);
  sheet.getCell("G2").value = "생성 일시"; sheet.getCell("H2").value = new Date(); sheet.getCell("H2").numFmt = "yyyy-mm-dd hh:mm";
  const summaries: Array<[string, ExcelJS.CellValue]> = [
    ["요구사항", { formula: `COUNTA(A${dataStart}:A${dataEnd})`, result: coverage.length }],
    ["검증 성공", { formula: `COUNTIF(I${dataStart}:I${dataEnd},"검증 성공")`, result: coverage.filter((item) => item.status === "passed").length }],
    ["검증 실패", { formula: `COUNTIF(I${dataStart}:I${dataEnd},"검증 실패")`, result: coverage.filter((item) => item.status === "failed").length }],
    ["테스트 없음", { formula: `COUNTIF(I${dataStart}:I${dataEnd},"테스트 없음")`, result: coverage.filter((item) => item.status === "uncovered").length }]
  ];
  summaries.forEach(([label, value], index) => {
    const column = index * 3 + 1;
    sheet.getCell(3, column).value = label;
    sheet.getCell(3, column).font = { bold: true };
    sheet.getCell(3, column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${subHeaderFill}` } };
    sheet.getCell(3, column + 1).value = value;
    sheet.getCell(3, column + 1).font = { bold: true, size: 14 };
  });
  header(sheet, 5, ["요구사항 ID", "요구사항 제목", "우선순위", "문서 출처", "기대 동작", "연결 시나리오 ID", "연결 시나리오", "개정", "최종 검증 상태", "최신 실행 결과", "최근 실행 시각", "예상 결과", "실제 결과", "실패 내용", "사용자 판정", "결함", "스크린샷 근거", "다음 조치"], [16, 30, 12, 22, 42, 27, 38, 10, 16, 34, 21, 42, 42, 42, 22, 26, 30, 28]);
  coverage.forEach((item) => {
    const runs = item.tests.map((test) => latest.get(test.id)).filter((run): run is AutomatedTestRun => Boolean(run));
    const linkedDefects = relatedDefects(item.tests, runs, defects);
    sheet.addRow([
      safeText(item.requirement.id), safeText(item.requirement.title), priorityLabels[item.requirement.priority], safeText(item.requirement.sourceReference), safeText(item.requirement.expectedBehavior),
      safeText(item.tests.map((test) => test.id).join("\n")), safeText(item.tests.map((test) => test.title).join("\n")), safeText(item.tests.map((test) => `${test.title}: ${test.revision || 1}판`).join("\n")), statusLabels[item.status],
      safeText(item.tests.map((test) => `${test.title}: ${latest.get(test.id) ? uiLabel(latest.get(test.id)!.status) : "미실행"}`).join("\n")), latestTime(runs),
      safeText(item.tests.map((test) => `${test.title}: ${assertions(test).join(" · ")}`).join("\n")), safeText(runs.map((run) => runActual(run)).filter(Boolean).join("\n")), safeText(runs.map((run) => runFailure(run)).filter(Boolean).join("\n")),
      safeText(runs.map((run) => run.review ? `${uiLabel(run.review.classification)}${run.review.note ? `: ${run.review.note}` : ""}` : "").filter(Boolean).join("\n")),
      safeText(linkedDefects.map((defect) => `${defect.id}: ${uiLabel(defect.status)}`).join("\n")), safeText(runs.flatMap((run) => run.screenshotArtifactIds).join("\n")), recommendation(item.status)
    ]);
  });
  sheet.getColumn(11).numFmt = "yyyy-mm-dd hh:mm";
  bodyStyle(sheet, dataStart, 18, 9);
}

function addAttentionSheet(workbook: ExcelJS.Workbook, detail: AnalysisDetail) {
  const sheet = workbook.addWorksheet("확인 필요 항목", { properties: { tabColor: { argb: "FFB7791F" } } });
  const coverage = buildRequirementCoverage(detail.documentAnalysis?.requirements || [], detail.generatedTests, detail.testRuns).filter((item) => item.status !== "passed");
  const latest = latestRunMap(detail.testRuns);
  title(sheet, "확인 필요 요구사항", 9);
  sheet.getCell("A2").value = "검증 성공을 제외한 미연결·미실행·실행 중·실패 요구사항입니다.";
  sheet.mergeCells("A2:I2");
  sheet.getCell("A2").alignment = { wrapText: true };
  header(sheet, 4, ["요구사항 ID", "요구사항 제목", "우선순위", "상태", "확인 이유", "연결 시나리오", "최신 실행", "권장 조치", "문서 출처"], [16, 32, 12, 16, 42, 38, 34, 30, 22]);
  coverage.forEach((item) => {
    const reason = item.status === "uncovered" ? "요구사항을 검증하는 테스트가 없습니다." : item.status === "not_run" ? "연결된 테스트의 실행 결과가 없습니다." : item.status === "running" ? "연결된 테스트가 실행 중입니다." : item.latestRuns.map((run) => runFailure(run)).filter(Boolean).join(" · ") || "최신 실행에서 검증에 실패했습니다.";
    sheet.addRow([safeText(item.requirement.id), safeText(item.requirement.title), priorityLabels[item.requirement.priority], statusLabels[item.status], safeText(reason), safeText(item.tests.map((test) => test.title).join("\n")), safeText(item.tests.map((test) => `${test.title}: ${latest.get(test.id) ? uiLabel(latest.get(test.id)!.status) : "미실행"}`).join("\n")), recommendation(item.status), safeText(item.requirement.sourceReference)]);
  });
  bodyStyle(sheet, 5, 9, 4);
}

export async function buildRequirementWorkbook(detail: AnalysisDetail, defects: QaDefect[] = []): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Probe QA";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  addTraceabilitySheet(workbook, detail, defects);
  addAttentionSheet(workbook, detail);
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

export function requirementWorkbookFileName(detail: AnalysisDetail): string {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `probe-qa-requirement-traceability-${day}-${detail.analysis.id.slice(0, 8)}.xlsx`;
}
