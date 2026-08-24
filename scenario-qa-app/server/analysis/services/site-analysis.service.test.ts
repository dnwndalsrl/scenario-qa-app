import { spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AiPageAnalysis, GeneratedTestScenario, PageSnapshot } from "../../../shared/types/analysis";

vi.mock("./ai-page-analysis.service", () => ({
  analyzePageWithAi: async (snapshot: PageSnapshot): Promise<AiPageAnalysis> => ({
    id: `page-analysis-${snapshot.pageId || "single"}`, analysisId: snapshot.analysisId, pageId: snapshot.pageId, pageType: "form", pagePurpose: "로컬 QA fixture의 주요 UI와 기본 품질을 검증합니다.",
    primaryFunctions: [{ id: "function-main", name: "주요 화면", description: "제목과 폼을 제공합니다.", relatedElementIds: [snapshot.headings[0]!.elementId], confidence: .95 }],
    risks: [], testOpportunities: [], confidence: .95, limitations: ["통합 테스트에서는 OpenAI 네트워크 호출을 고정된 provider로 대체합니다."], model: "integration-mock", promptVersion: "v1", inputCharacters: 1, generatedAt: new Date().toISOString()
  })
}));

vi.mock("./ai-test-generation.service", () => ({
  generateTestsWithAi: async (snapshot: PageSnapshot): Promise<GeneratedTestScenario[]> => {
    const heading = snapshot.elements.find((element) => element.type === "heading")!;
    const danger = snapshot.elements.find((element) => element.testId === "delete-button");
    const make = (id: string, status: "safe" | "blocked", expected?: string): GeneratedTestScenario => ({
      id: `test-${id}`, analysisId: snapshot.analysisId, title: id, description: id, purpose: id, category: "visibility", safetyLevel: status,
      safetyReasons: [status === "blocked" ? "삭제 동작 차단" : "읽기 전용 검증"], confidence: .9, autoExecutable: status === "safe", sourceElementIds: [status === "blocked" ? danger!.id : heading.id],
      steps: status === "blocked" ? [{ id: `step-${id}`, order: 1, action: "click", description: "계정 삭제", elementId: danger!.id, locator: danger!.locatorCandidates.find((item) => item.unique), evidence: [danger!.id] }] : [{ id: `step-${id}-goto`, order: 1, action: "goto", description: "페이지 접속", evidence: [snapshot.finalUrl] }, { id: `step-${id}-assert`, order: 2, action: expected ? "assert_text" : "assert_visible", description: "제목 확인", elementId: heading.id, locator: heading.locatorCandidates.find((item) => item.unique), expected, evidence: [heading.id] }],
      generatedAt: new Date().toISOString()
    });
    return [make("success", "safe"), ...(danger ? [make("failed", "safe", "존재하지 않는 제목"), make("danger", "blocked")] : [])];
  }
}));

const fixtureUrl = "http://127.0.0.1:3012"; const storageRoot = path.resolve(process.cwd(), "test/.tmp-flow-storage"); let fixture: ChildProcess;

beforeAll(async () => {
  process.env.ALLOW_LOCAL_TEST_TARGETS = "true"; process.env.ALLOWED_LOCAL_TEST_PORTS = "3012"; process.env.NUXT_STORAGE_ROOT = storageRoot; process.env.FIXTURE_PORT = "3012";
  fixture = spawn(process.execPath, ["test/fixtures/site/server.mjs"], { cwd: process.cwd(), env: process.env, stdio: "ignore", windowsHide: true });
  for (let count = 0; count < 40; count += 1) { if (await fetch(`${fixtureUrl}/health`).then((response) => response.ok).catch(() => false)) return; await new Promise((resolve) => setTimeout(resolve, 100)); }
  throw new Error("Fixture did not start");
});
afterAll(async () => { fixture?.kill(); await rm(storageRoot, { recursive: true, force: true }); });

describe("URL 입력부터 QA 보고서까지", () => {
  it("비동기 분석, 수집, AI provider, 안전 실행과 요약 저장을 연결한다", async () => {
    const { createSiteAnalysis, getAnalysisDetail } = await import("./site-analysis.service");
    const created = await createSiteAnalysis(fixtureUrl);
    expect(created.status).toBe("pending");
    let detail;
    for (let poll = 0; poll < 100; poll += 1) { detail = await getAnalysisDetail(created.id); if (["completed", "failed"].includes(detail.analysis.status)) break; await new Promise((resolve) => setTimeout(resolve, 100)); }
    expect(detail?.analysis.status).toBe("completed"); expect(detail?.snapshot?.elements.length).toBeGreaterThan(10); expect(detail?.pageAnalysis?.pageType).toBe("form");
    expect(detail?.generatedTests).toHaveLength(3); expect(detail?.testRuns.map((run) => run.status)).toEqual(["success", "failed", "blocked"]);
    expect(detail?.testRuns.find((run) => run.status === "failed")?.screenshotArtifactIds.length).toBeGreaterThan(0);
    expect(detail?.analysis.summary).toMatchObject({ generatedTestCount: 3, successCount: 1, failedCount: 1, blockedCount: 1, overallStatus: "failed" });
  });
  it("동일 origin의 주요 페이지를 제한적으로 탐색하고 위험 링크를 방문하지 않는다", async () => {
    const { createSiteAnalysis, getAnalysisDetail } = await import("./site-analysis.service");
    const created = await createSiteAnalysis(fixtureUrl, { mode: "site_crawl", maxPages: 5, maxDepth: 2 }); let detail;
    for (let poll = 0; poll < 400; poll += 1) { detail = await getAnalysisDetail(created.id); if (["completed", "partially_completed", "failed"].includes(detail.analysis.status)) break; await new Promise((resolve) => setTimeout(resolve, 100)); }
    expect(["completed", "partially_completed"], JSON.stringify(detail?.analysis)).toContain(detail?.analysis.status); expect(detail?.pages.length).toBeGreaterThan(1); expect(detail?.pages.length).toBeLessThanOrEqual(5); expect(detail?.siteMap?.nodes.length).toBe(detail?.pages.length); expect(detail?.generatedTests.length).toBeGreaterThan(1);
    expect(detail?.pages.every((page) => new URL(page.page.normalizedUrl).origin === fixtureUrl)).toBe(true); expect(detail?.analysis.crawlState?.maxPages).toBe(5);
    const log = await fetch(`${fixtureUrl}/requests`).then((response) => response.json()) as { requests: string[] };
    expect(log.requests.some((value) => /\/logout|\/account\/delete|manual\.pdf|private-preview/.test(value))).toBe(false);
  });
});
