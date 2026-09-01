import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";
import type { AnalysisDetail, QaDefect } from "../../shared/types/analysis";
import { buildQaReportPdf, qaReportPdfFileName } from "./qa-report-pdf.service";

const now = "2026-08-31T03:00:00.000Z";

function fixture(): { detail: AnalysisDetail; defects: QaDefect[] } {
  const detail = {
    analysis: { id: "analysis-12345678", targetUrl: "https://example.com", normalizedUrl: "https://example.com/", status: "completed", processStage: "report_complete", progress: 100, options: { mode: "single_page", testMode: "read_only", autoRunSafeTests: false, viewport: { width: 1440, height: 900 }, timeoutMs: 30000, maxPages: 1, maxDepth: 0, includeQueryUrls: false, respectNoFollow: true }, pageIds: [], pageAnalysisIds: [], generatedTestIds: [], testRunIds: [], createdAt: now, updatedAt: now, completedAt: now, summary: { discoveredElementCount: 3, discoveredFunctionCount: 1, generatedTestCount: 2, executedTestCount: 2, successCount: 1, failedCount: 1, blockedCount: 0, errorCount: 0, inconclusiveCount: 0, consoleErrorCount: 0, networkIssueCount: 0, criticalIssueCount: 0, warningCount: 1, overallStatus: "failed" } },
    documentAnalysis: { fileName: "requirements.pdf", status: "completed", summary: "메인 화면 요구사항", limitations: ["모바일 화면은 별도 확인이 필요합니다."], missingInformation: [], requirements: [{ id: "REQ-1", title: "메인 제목 표시", description: "", expectedBehavior: "메인 제목이 표시된다.", priority: "high", sourceReference: "2쪽" }] },
    generatedTests: [
      { id: "test-1", analysisId: "analysis-12345678", title: "메인 제목 표시 확인", description: "", purpose: "제목 검증", category: "visibility", safetyLevel: "safe", safetyReasons: [], confidence: .9, autoExecutable: true, sourceElementIds: [], requirementIds: ["REQ-1"], revision: 2, generatedAt: now, steps: [{ id: "step-1", order: 1, action: "assert_title", description: "제목 확인", expected: "Example", evidence: [] }] },
      { id: "test-2", analysisId: "analysis-12345678", title: "문의 버튼 표시 확인", description: "", purpose: "버튼 검증", category: "visibility", safetyLevel: "safe", safetyReasons: [], confidence: .8, autoExecutable: true, sourceElementIds: [], revision: 1, generatedAt: now, steps: [{ id: "step-2", order: 1, action: "assert_visible", description: "문의 버튼 확인", expected: "문의하기 표시", evidence: [] }] }
    ],
    testRuns: [
      { id: "run-1", analysisId: "analysis-12345678", scenarioId: "test-1", status: "success", startedAt: now, completedAt: now, consoleIssues: [], networkIssues: [], screenshotArtifactIds: [], stepResults: [{ stepId: "step-1", order: 1, action: "assert_title", description: "제목 확인", status: "success", expected: "Example", actual: "Example" }] },
      { id: "run-2", analysisId: "analysis-12345678", scenarioId: "test-2", status: "failed", startedAt: now, completedAt: now, consoleIssues: [], networkIssues: [], screenshotArtifactIds: ["artifact-1"], error: { code: "ELEMENT_NOT_FOUND", message: "문의 버튼을 찾지 못했습니다." }, stepResults: [{ stepId: "step-2", order: 1, action: "assert_visible", description: "문의 버튼 확인", status: "failed", expected: "문의하기 표시", actual: "요소 없음", errorMessage: "문의 버튼을 찾지 못했습니다." }] }
    ],
    pageAnalysis: { id: "page-analysis-1", analysisId: "analysis-12345678", pageType: "landing", pagePurpose: "예제 페이지", primaryFunctions: [], risks: [], testOpportunities: [], confidence: .9, limitations: [], model: "test", promptVersion: "1", inputCharacters: 10, generatedAt: now },
    pages: []
  } as unknown as AnalysisDetail;
  const defects = [{ id: "defect-1", analysisId: detail.analysis.id, sourceRunId: "run-2", scenarioId: "test-2", scenarioTitle: "문의 버튼 표시 확인", targetUrl: detail.analysis.normalizedUrl, title: "문의 버튼 누락", description: "버튼이 보이지 않습니다.", status: "new", severity: "high", priority: "P2", assignee: "", failureSummary: "문의 버튼을 찾지 못했습니다.", failedStepOrders: [1], screenshotArtifactIds: ["artifact-1"], notes: [], history: [], createdAt: now, updatedAt: now }] as QaDefect[];
  return { detail, defects };
}

async function fonts() {
  const directory = path.resolve(process.cwd(), "server/assets/pdf-fonts");
  return { regular: await readFile(path.join(directory, "NotoSansKR-Regular.woff")), bold: await readFile(path.join(directory, "NotoSansKR-Bold.woff")) };
}

describe("QA report PDF", () => {
  it("한글 요약·요구사항·예상/실제 결과·결함·한계를 포함한다", async () => {
    const { detail, defects } = fixture();
    const pdf = await buildQaReportPdf(detail, defects, [], await fonts());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const parser = new PDFParse({ data: pdf });
    try {
      const extracted = await parser.getText();
      expect(extracted.total).toBe(2);
      expect(extracted.text).toContain("최종 QA 결과보고서");
      expect(extracted.text).toContain("REQ-1 메인 제목 표시");
      expect(extracted.text).toContain("예상 Example");
      expect(extracted.text).toContain("실제 요소 없음");
      expect(extracted.text).toContain("문의 버튼 누락");
      expect(extracted.text).toContain("모바일 화면은 별도 확인이 필요합니다.");
    } finally { await parser.destroy(); }
  });

  it("분석 식별자가 포함된 파일명을 만든다", () => {
    expect(qaReportPdfFileName(fixture().detail)).toMatch(/^probe-qa-final-report-\d{8}-analysis\.pdf$/);
  });
});
