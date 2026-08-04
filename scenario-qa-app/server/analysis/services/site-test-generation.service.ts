import type { CrawledPage, GeneratedTestScenario, PageSnapshot, SiteMapEdge } from "../../../shared/types/analysis";
import { createId } from "../../utils/id";

export function generateSiteLevelTests(analysisId: string, pages: CrawledPage[], snapshots: Map<string, PageSnapshot>, edges: SiteMapEdge[], maxTests: number): GeneratedTestScenario[] {
  const tests: GeneratedTestScenario[] = [];
  for (const page of pages.filter((item) => item.status === "collected" || item.status === "analyzed")) {
    const snapshot = snapshots.get(page.id); if (!snapshot?.title || tests.length >= maxTests) continue;
    tests.push({ id: createId("test"), analysisId, pageId: page.id, title: `${snapshot.title} 기본 로드 확인`, description: "사이트 공통 규칙으로 페이지 응답과 title을 확인합니다.", purpose: `사이트 공통 title 품질: ${snapshot.finalUrl}`, category: "page_load", safetyLevel: "safe", safetyReasons: ["읽기 전용 페이지 로드와 title 검증"], confidence: .95, autoExecutable: true, sourceElementIds: [], steps: [{ id: createId("step"), order: 1, action: "goto", description: "페이지 접속", evidence: [snapshot.finalUrl] }, { id: createId("step"), order: 2, action: "assert_title", description: "title 존재 확인", expected: snapshot.title, evidence: ["수집된 document.title"] }], generatedAt: new Date().toISOString() });
  }
  for (const mapEdge of edges.filter((item) => item.followed && item.toPageId)) {
    if (tests.length >= maxTests) break; const source = snapshots.get(mapEdge.fromPageId); const target = pages.find((page) => page.id === mapEdge.toPageId); const element = source?.elements.find((item) => item.id === mapEdge.elementId); const locator = element?.locatorCandidates.find((item) => item.unique);
    if (!source || !target?.finalUrl || !element || !locator || element.safetyHints.length) continue;
    tests.push({ id: createId("test"), analysisId, pageId: mapEdge.fromPageId, title: `${mapEdge.linkText || "내부 링크"} 이동 확인`, description: "실제로 발견된 동일 origin 링크를 클릭하고 목적 URL을 확인합니다.", purpose: `안전한 다중 페이지 navigation: ${source.finalUrl} → ${target.finalUrl}`, category: "navigation", safetyLevel: "safe", safetyReasons: ["동일 origin", "실제 발견 링크", "상태 변경 없음"], confidence: .85, autoExecutable: true, sourceElementIds: [element.id], steps: [{ id: createId("step"), order: 1, action: "goto", description: "출발 페이지 접속", evidence: [source.finalUrl] }, { id: createId("step"), order: 2, action: "click", description: "내부 링크 클릭", elementId: element.id, locator, evidence: [element.id] }, { id: createId("step"), order: 3, action: "assert_url", description: "대상 URL 이동 확인", expected: target.finalUrl, evidence: [mapEdge.id] }], generatedAt: new Date().toISOString() });
  }
  return tests;
}
