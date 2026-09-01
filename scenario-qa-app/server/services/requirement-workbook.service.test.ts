import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { AnalysisDetail, QaDefect } from "../../shared/types/analysis";
import { buildRequirementWorkbook, requirementWorkbookFileName } from "./requirement-workbook.service";

function fixture(): { detail: AnalysisDetail; defects: QaDefect[] } {
  const now = "2026-08-31T01:00:00.000Z";
  const detail = {
    analysis: { id: "analysis-12345678", targetUrl: "https://example.com", normalizedUrl: "https://example.com/", status: "completed", processStage: "report_complete", progress: 100, options: { mode: "single_page", testMode: "read_only", autoRunSafeTests: false, viewport: { width: 1440, height: 900 }, timeoutMs: 30000, maxPages: 1, maxDepth: 0, includeQueryUrls: false, respectNoFollow: true }, pageIds: [], pageAnalysisIds: [], generatedTestIds: [], testRunIds: [], createdAt: now, updatedAt: now },
    documentAnalysis: { fileName: "requirements.pdf", status: "completed", summary: "", limitations: [], missingInformation: [], requirements: [
      { id: "REQ-1", title: "메인 제목 표시", description: "", expectedBehavior: "메인 제목이 표시된다.", priority: "high", sourceReference: "2쪽" },
      { id: "=REQ-2", title: "미구현 기능", description: "", expectedBehavior: "기능이 동작한다.", priority: "medium", sourceReference: "3쪽" }
    ] },
    generatedTests: [{ id: "test-1", analysisId: "analysis-12345678", title: "제목 확인", description: "", purpose: "제목 검증", category: "visibility", safetyLevel: "safe", safetyReasons: [], confidence: .9, autoExecutable: true, sourceElementIds: [], requirementIds: ["REQ-1"], revision: 2, generatedAt: now, steps: [{ id: "step-1", order: 1, action: "assert_title", description: "제목 확인", expected: "Example", evidence: [] }] }],
    testRuns: [{ id: "run-1", analysisId: "analysis-12345678", scenarioId: "test-1", status: "success", startedAt: now, completedAt: now, durationMs: 100, consoleIssues: [], networkIssues: [], screenshotArtifactIds: ["artifact-1"], stepResults: [{ stepId: "step-1", order: 1, action: "assert_title", description: "제목 확인", status: "success", expected: "Example", actual: "Example" }] }],
    pages: []
  } as unknown as AnalysisDetail;
  return { detail, defects: [] };
}

describe("requirement workbook", () => {
  it("RTM과 확인 필요 시트를 현재 커버리지 상태로 만든다", async () => {
    const { detail, defects } = fixture();
    const bytes = await buildRequirementWorkbook(detail, defects);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as any);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["요구사항 추적표", "확인 필요 항목"]);
    const traceability = workbook.getWorksheet("요구사항 추적표")!;
    const attention = workbook.getWorksheet("확인 필요 항목")!;
    expect(traceability.getCell("A6").value).toBe("REQ-1");
    expect(traceability.getCell("I6").value).toBe("검증 성공");
    expect(traceability.getCell("J6").value).toBe("제목 확인: 성공");
    expect(traceability.getCell("L6").value).toContain("Example");
    expect(traceability.getCell("M6").value).toBe("Example");
    expect(traceability.getCell("Q6").value).toBe("artifact-1");
    expect(traceability.getCell("A7").value).toBe("'=REQ-2");
    expect(traceability.getCell("I7").value).toBe("테스트 없음");
    expect(traceability.getCell("B3").value).toMatchObject({ formula: "COUNTA(A6:A7)", result: 2 });
    expect(attention.getCell("A5").value).toBe("'=REQ-2");
    expect(attention.getCell("D5").value).toBe("테스트 없음");
    expect(attention.getCell("H5").value).toBe("테스트 시나리오 생성");
    expect(traceability.views[0]).toMatchObject({ state: "frozen", ySplit: 5, showGridLines: false });
  });

  it("분석 식별자가 포함된 파일명을 만든다", () => {
    expect(requirementWorkbookFileName(fixture().detail)).toMatch(/^probe-qa-requirement-traceability-\d{8}-analysis\.xlsx$/);
  });
});
