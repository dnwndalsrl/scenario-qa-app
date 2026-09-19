import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detailPage = readFileSync(new URL("../pages/analyses/[analysisId].vue", import.meta.url), "utf8");
const report = readFileSync(new URL("../components/analysis/ReportDoneView.vue", import.meta.url), "utf8");

describe("3단계 완료 보고서", () => {
  it("완료된 단일 페이지 분석에만 별도 보고서를 사용한다", () => {
    expect(detailPage).toContain("data.analysis.processStage === 'report_complete' && data.analysis.options.mode !== 'site_crawl'");
    expect(detailPage).toContain("<ReportDoneView");
  });

  it("M07 섹션 순서와 완료 요약을 유지한다", () => {
    const anchors = ["report-summary", "report-comparison", "report-page", "report-scenarios", "report-results", "report-defects", "report-issues"];
    expect(anchors.map((id) => report.indexOf(`href="#${id}"`))).toEqual([...anchors.map((id) => report.indexOf(`href="#${id}"`))].sort((a, b) => a - b));
    expect(report).not.toContain("<AnalysisProgress");
    expect(report).toContain("✓ 완료 · Playwright 실행 완료");
  });

  it("2단계 상세 편집 흐름과 기존 결과 관리 기능을 연결한다", () => {
    expect(report).toContain("modal-mode complete-mode");
    expect(report).toContain("<TestSuiteManager");
    expect(report).toContain("<TestRunResult");
    expect(report).toContain("<DefectManager");
    expect(report).toContain("<IssueList");
  });

  it("시나리오 모달의 닫기, 배경 스크롤, 상태 뱃지와 액션 모양을 제어한다", () => {
    expect(report).toContain('aria-label="닫기"');
    expect(report).toContain('document.documentElement.style.overflow = "hidden"');
    expect(report).toContain("onBeforeUnmount(releasePageScroll)");
    expect(report).toContain(".test-card__head>.tag");
    expect(report).toContain(".scenario-card>.scenario-actions>button");
  });
});
