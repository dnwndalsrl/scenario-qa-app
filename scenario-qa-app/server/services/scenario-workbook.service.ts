import ExcelJS from "exceljs";
import type { AnalysisDetail, AutomatedTestRun, GeneratedTestScenario, GeneratedTestStep, PageSnapshot } from "../../shared/types/analysis";
import { latestTestRuns } from "../../shared/utils/test-run-history";
import { testStabilityLabel, testStabilitySummary } from "../../shared/utils/test-stability";
import { uiLabel } from "../../utils/ui-label";

const ACTION_LABELS: Record<string, string> = {
  goto: "페이지 접속", scroll_to_ratio: "페이지 비율로 스크롤", scroll_by: "현재 위치에서 스크롤",
  scroll_into_view: "대상 요소로 스크롤", wait_for_stable: "요소 안정화 대기", click: "클릭",
  assert_in_viewport: "화면 안에 표시 확인", assert_scroll: "스크롤 결과 확인", assert_visible: "표시 확인",
  assert_hidden: "숨김 확인", assert_enabled: "활성 상태 확인", assert_text: "텍스트 확인",
  assert_attribute: "속성 상태 확인", assert_value: "입력값 확인", assert_count: "요소 개수 확인",
  assert_url: "URL 확인", assert_title: "페이지 제목 확인", fill: "입력", select: "선택",
  press: "키 입력", check: "체크", uncheck: "체크 해제"
};

const headerFill = "24344D";
const subHeaderFill = "E8EEF5";
const borderColor = "CBD5E1";

function safeText(value: unknown): string {
  const text = String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 32700);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function actionLabel(action: string): string { return ACTION_LABELS[action] || action; }
function isAssertion(step: GeneratedTestStep): boolean { return step.action.startsWith("assert_"); }
function inputValue(step: GeneratedTestStep): string {
  if (step.action === "fill" && step.value) return "[보안상 제외]";
  return safeText(step.value);
}
function expectedValue(step: GeneratedTestStep): string {
  if (!isAssertion(step)) return "";
  return safeText(step.expected || step.description);
}
function latestRunByScenario(runs: AutomatedTestRun[]): Map<string, AutomatedTestRun> {
  return new Map(latestTestRuns(runs).map((run) => [run.scenarioId, run]));
}
function addRow(sheet: ExcelJS.Worksheet, values: unknown[]) {
  sheet.addRow(values.map((value) => value === "" ? null : value) as ExcelJS.CellValue[]);
}
function pageSnapshot(detail: AnalysisDetail, test: GeneratedTestScenario): PageSnapshot | undefined {
  if (!test.pageId || detail.snapshot?.pageId === test.pageId) return detail.snapshot;
  return detail.pages.find((page) => page.page.id === test.pageId)?.snapshot;
}
function targetElement(detail: AnalysisDetail, test: GeneratedTestScenario, step: GeneratedTestStep): string {
  if (!step.elementId) return "";
  const element = pageSnapshot(detail, test)?.elements.find((item) => item.id === step.elementId);
  return safeText(element ? `${step.elementId} · ${element.accessibleName || element.text || element.type}` : step.elementId);
}

function styleTable(sheet: ExcelJS.Worksheet, widths: number[]) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: widths.length } };
  sheet.getRow(1).height = 28;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerFill}` } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.height = 34;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: `FF${borderColor}` } } };
    });
  });
}

function addSummarySheet(workbook: ExcelJS.Workbook, detail: AnalysisDetail) {
  const sheet = workbook.addWorksheet("요약", { properties: { tabColor: { argb: `FF${headerFill}` } } });
  sheet.columns = [{ width: 23 }, { width: 74 }, { width: 22 }, { width: 22 }];
  sheet.mergeCells("A1:D1");
  sheet.getCell("A1").value = "Probe QA 테스트 시나리오";
  sheet.getCell("A1").font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerFill}` } };
  sheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 36;
  const metadata = [
    ["분석 ID", detail.analysis.id], ["대상 URL", detail.analysis.normalizedUrl],
    ["분석 상태", uiLabel(detail.analysis.status)], ["생성 일시", new Date().toISOString()],
    ["시나리오 수", { formula: `COUNTA('테스트 시나리오'!A2:A${Math.max(2, detail.generatedTests.length + 1)})`, result: detail.generatedTests.length }],
    ["안전 시나리오", { formula: `COUNTIF('테스트 시나리오'!H2:H${Math.max(2, detail.generatedTests.length + 1)},"안전")`, result: detail.generatedTests.filter((test) => test.safetyLevel === "safe").length }],
    ["최근 실행 성공", { formula: `COUNTIF('테스트 시나리오'!N2:N${Math.max(2, detail.generatedTests.length + 1)},"성공")`, result: latestTestRuns(detail.testRuns).filter((run) => run.status === "success").length }]
  ];
  metadata.forEach(([label, value], index) => {
    const row = index + 3;
    sheet.getCell(row, 1).value = label as string;
    sheet.getCell(row, 1).font = { bold: true };
    sheet.getCell(row, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${subHeaderFill}` } };
    sheet.getCell(row, 2).value = value as ExcelJS.CellValue;
    sheet.getCell(row, 2).alignment = { wrapText: true, vertical: "top" };
  });
  sheet.mergeCells("A12:D12");
  sheet.getCell("A12").value = "사용 안내: 테스트 시나리오에서 목적·사전 조건을 확인하고, 테스트 단계의 동작과 예상 결과를 기준으로 검증하세요. 입력 동작의 값은 보안을 위해 내보내지 않습니다.";
  sheet.getCell("A12").alignment = { wrapText: true, vertical: "middle" };
  sheet.getCell("A12").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7E6" } };
  sheet.getRow(12).height = 48;
}

function addScenarioSheet(workbook: ExcelJS.Workbook, detail: AnalysisDetail, runs: Map<string, AutomatedTestRun>) {
  const sheet = workbook.addWorksheet("테스트 시나리오");
  addRow(sheet, ["시나리오 ID", "대상 화면/URL", "테스트 케이스명", "테스트 목적", "사전 조건", "우선순위", "테스트 유형", "안전 상태", "자동 실행", "신뢰도", "요구사항 ID", "작성 주체", "개정", "최종 결과", "실행 안정성", "최근 실행 수", "관찰 성공률", "자동 재검증 회복"]);
  detail.generatedTests.forEach((test) => {
    const run = runs.get(test.id);
    const snapshot = pageSnapshot(detail, test);
    const stability = testStabilitySummary(test.id, detail.testRuns);
    addRow(sheet, [
      safeText(test.id), safeText(snapshot?.finalUrl || detail.analysis.normalizedUrl), safeText(test.title), safeText(test.purpose || test.description),
      "분석 대상 페이지에 접속할 수 있어야 함", test.safetyLevel === "safe" && test.autoExecutable ? "보통" : "검토",
      uiLabel(test.category), uiLabel(test.safetyLevel), test.autoExecutable ? "가능" : "검토 필요", Math.round(test.confidence * 100) / 100,
      safeText(test.requirementIds?.join(", ")), test.source === "user" ? "사용자" : "AI 제안", test.revision || 1, run ? uiLabel(run.status) : "미실행",
      testStabilityLabel(stability.status), stability.executionCount, stability.observationCount ? stability.successRate / 100 : "", stability.recoveredCount
    ]);
  });
  sheet.getColumn(10).numFmt = "0%";
  sheet.getColumn(17).numFmt = "0%";
  styleTable(sheet, [24, 38, 32, 42, 34, 12, 16, 14, 14, 12, 22, 14, 10, 14, 16, 14, 14, 18]);
}

function addStepSheet(workbook: ExcelJS.Workbook, detail: AnalysisDetail) {
  const sheet = workbook.addWorksheet("테스트 단계");
  addRow(sheet, ["시나리오 ID", "단계", "구분", "동작", "대상 요소", "입력값", "예상 결과", "설명", "근거"]);
  detail.generatedTests.forEach((test) => test.steps.slice().sort((a, b) => a.order - b.order).forEach((step) => {
    addRow(sheet, [
      safeText(test.id), step.order, isAssertion(step) ? "검증" : "실행", actionLabel(step.action), targetElement(detail, test, step),
      inputValue(step), expectedValue(step), safeText(step.description), safeText(step.evidence.join(" · "))
    ]);
  }));
  styleTable(sheet, [24, 8, 10, 22, 38, 24, 42, 42, 38]);
}

function addResultSheet(workbook: ExcelJS.Workbook, detail: AnalysisDetail, runs: Map<string, AutomatedTestRun>) {
  const sheet = workbook.addWorksheet("실행 결과");
  addRow(sheet, ["시나리오 ID", "실행 ID", "단계", "동작", "판정", "예상", "실제", "오류/비고", "시작", "완료", "소요(ms)", "자동 재검증"]);
  detail.generatedTests.forEach((test) => {
    const run = runs.get(test.id);
    if (!run?.stepResults.length) {
      addRow(sheet, [safeText(test.id), safeText(run?.id), "", "", run ? uiLabel(run.status) : "미실행", "", "", safeText(run?.error?.message), run?.startedAt || "", run?.completedAt || "", run?.durationMs ?? "", run?.revalidation ? (run.revalidation.recovered ? "재검증 후 회복" : "재검증 후 동일 오류") : ""]);
      return;
    }
    run.stepResults.slice().sort((a, b) => a.order - b.order).forEach((step) => addRow(sheet, [
      safeText(test.id), safeText(run.id), step.order, actionLabel(step.action), uiLabel(step.status), safeText(step.expected), safeText(step.actual),
      safeText(step.errorMessage || (step.failureKind ? uiLabel(step.failureKind) : "")), step.startedAt || "", step.completedAt || "", step.durationMs ?? "",
      run.revalidation ? (run.revalidation.recovered ? "재검증 후 회복" : "재검증 후 동일 오류") : ""
    ]));
  });
  styleTable(sheet, [24, 24, 8, 22, 14, 38, 38, 42, 22, 22, 14, 20]);
}

export async function buildScenarioWorkbook(detail: AnalysisDetail): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Probe QA";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const runs = latestRunByScenario(detail.testRuns);
  addSummarySheet(workbook, detail);
  addScenarioSheet(workbook, detail, runs);
  addStepSheet(workbook, detail);
  addResultSheet(workbook, detail, runs);
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

export function scenarioWorkbookFileName(detail: AnalysisDetail): string {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `probe-qa-test-scenarios-${day}-${detail.analysis.id.slice(0, 8)}.xlsx`;
}
