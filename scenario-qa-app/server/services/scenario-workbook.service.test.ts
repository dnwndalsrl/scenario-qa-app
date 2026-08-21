import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { AnalysisDetail } from "../../shared/types/analysis";
import { buildScenarioWorkbook, scenarioWorkbookFileName } from "./scenario-workbook.service";

function fixture(): AnalysisDetail {
  const now = "2026-08-21T00:00:00.000Z";
  return {
    analysis: {
      id: "analysis-12345678", targetUrl: "https://example.com", normalizedUrl: "https://example.com/", status: "completed",
      processStage: "report_complete", progress: 100, currentMessage: "완료", options: { mode: "single_page", testMode: "read_only", autoRunSafeTests: false, viewport: { width: 1440, height: 900 }, timeoutMs: 30000, maxPages: 1, maxDepth: 0, includeQueryUrls: false, respectNoFollow: true },
      pageIds: [], pageAnalysisIds: [], generatedTestIds: [], testRunIds: [], createdAt: now, updatedAt: now
    },
    snapshot: {
      id: "snapshot-1", analysisId: "analysis-12345678", pageId: "page-1", requestedUrl: "https://example.com", finalUrl: "https://example.com/", title: "예제", viewport: { width: 1440, height: 900 }, headings: [], forms: [], internalLinks: [], consoleMessages: [], networkIssues: [], collectedAt: now,
      elements: [{ id: "element-1", type: "button", tagName: "button", text: "로그인", accessibleName: "로그인", locatorCandidates: [], safetyHints: [], visible: true, enabled: true }]
    },
    generatedTests: [{
      id: "test-1", analysisId: "analysis-12345678", pageId: "page-1", title: "=위험한 제목", description: "로그인 확인", purpose: "로그인 결과 검증", category: "interaction", safetyLevel: "safe", safetyReasons: ["읽기 전용"], confidence: 0.9, autoExecutable: true, sourceElementIds: ["element-1"], generatedAt: now, revision: 2, source: "user", requirementIds: ["REQ-1"],
      steps: [
        { id: "step-1", order: 1, action: "fill", description: "비밀번호 입력", elementId: "element-1", value: "secret-password", evidence: [] },
        { id: "step-2", order: 2, action: "click", description: "로그인 클릭", elementId: "element-1", evidence: [] },
        { id: "step-3", order: 3, action: "assert_url", description: "대시보드 이동 확인", expected: "url-prefix:https://example.com/dashboard", evidence: ["REQ-1"] }
      ]
    }],
    testRuns: [{
      id: "run-1", analysisId: "analysis-12345678", pageId: "page-1", scenarioId: "test-1", status: "success", consoleIssues: [], networkIssues: [], screenshotArtifactIds: [], startedAt: now, completedAt: now, durationMs: 1200, scenarioRevision: 2,
      stepResults: [{ id: undefined, stepId: "step-3", order: 3, action: "assert_url", description: "대시보드 이동 확인", status: "success", expected: "https://example.com/dashboard", actual: "https://example.com/dashboard", durationMs: 200 }]
    }],
    pages: []
  } as unknown as AnalysisDetail;
}

describe("scenario workbook", () => {
  it("일반 QA 양식과 예상/실제 결과를 XLSX로 만든다", async () => {
    const bytes = await buildScenarioWorkbook(fixture());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as any);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["요약", "테스트 시나리오", "테스트 단계", "실행 결과"]);
    const scenarios = workbook.getWorksheet("테스트 시나리오")!;
    const steps = workbook.getWorksheet("테스트 단계")!;
    const results = workbook.getWorksheet("실행 결과")!;
    expect(scenarios.getCell("C2").value).toBe("'=위험한 제목");
    expect(steps.getCell("F2").value).toBe("[보안상 제외]");
    expect(JSON.stringify(steps.getSheetValues())).not.toContain("secret-password");
    expect(steps.getCell("G4").value).toBe("url-prefix:https://example.com/dashboard");
    expect(results.getCell("F2").value).toBe("https://example.com/dashboard");
    expect(results.getCell("G2").value).toBe("https://example.com/dashboard");
  });

  it("분석 식별자가 포함된 안전한 파일명을 만든다", () => {
    expect(scenarioWorkbookFileName(fixture())).toMatch(/^probe-qa-test-scenarios-\d{8}-analysis\.xlsx$/);
  });
});
