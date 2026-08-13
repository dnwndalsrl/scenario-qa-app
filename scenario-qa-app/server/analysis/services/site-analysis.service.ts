import type { AnalysisDetail, AnalysisSummary, AutomatedTestRun, CrawledPage, CrawlQueueItem, GeneratedTestScenario, PageDetail, PageSnapshot, RequirementDocumentAnalysis, SiteAnalysis, SiteAnalysisOptions, SiteAnalysisStatus, SiteAnalysisSummary, SiteMapEdge, TestDeduplicationResult } from "../../../shared/types/analysis";
import { ANALYSIS_STAGES } from "../../../shared/types/analysis";
import { AppError, ERROR_MESSAGES } from "../../../shared/errors";
import { getAnalysisConfig } from "../../config";
import { CrawlQueue } from "../../crawl/crawl-queue";
import { monotonicProgress } from "../../crawl/crawl-progress";
import { scoreLink } from "../../crawl/link-priority";
import { createPageFingerprint } from "../../crawl/page-fingerprint";
import { buildSiteMap } from "../../crawl/site-map-builder";
import { filterCrawlLink } from "../../crawl/url-filter";
import { normalizeUrlPattern } from "../../crawl/url-pattern";
import { PageCollectionSession, collectPage } from "../../playwright/page-collector";
import { executeGeneratedTests } from "../../playwright/test-executor";
import { validateTargetUrl } from "../../security/url-validator";
import { createId } from "../../utils/id";
import { analysisRepository } from "../repositories/analysis.repository";
import { crawlPageRepository } from "../repositories/crawl-page.repository";
import { generatedTestRepository } from "../repositories/generated-test.repository";
import { pageAnalysisRepository } from "../repositories/page-analysis.repository";
import { siteLevelAnalysisRepository } from "../repositories/site-level-analysis.repository";
import { siteMapRepository } from "../repositories/site-map.repository";
import { snapshotRepository } from "../repositories/snapshot.repository";
import { automatedTestRunRepository } from "../repositories/test-run.repository";
import { analyzePageWithAi } from "./ai-page-analysis.service";
import { generateTestsWithAi } from "./ai-test-generation.service";
import { buildSummary } from "./analysis-summary.service";
import { analyzeSiteWithAi, buildSiteLevelAnalysis } from "./site-level-analysis.service";
import { generateSiteLevelTests } from "./site-test-generation.service";
import { deduplicateTests } from "./test-deduplication.service";

let activeAnalysisId: string | undefined;
const terminal = new Set<SiteAnalysisStatus>(["completed", "partially_completed", "failed"]);
const deduplicationByAnalysis = new Map<string, TestDeduplicationResult>();
const documentByAnalysis = new Map<string, RequirementDocumentAnalysis>();

export async function createSiteAnalysis(targetUrl: string, overrides: Partial<SiteAnalysisOptions> & { documentAnalysis?: RequirementDocumentAnalysis } = {}): Promise<SiteAnalysis> {
  if (activeAnalysisId) throw new AppError("ANALYSIS_ALREADY_RUNNING", undefined, 409);
  const normalizedUrl = await validateTargetUrl(targetUrl);
  const existing = (await analysisRepository.list()).find((item) => item.normalizedUrl === normalizedUrl && !terminal.has(item.status));
  if (existing) throw new AppError("ANALYSIS_ALREADY_RUNNING", "같은 URL의 분석이 이미 진행 중입니다.", 409);
  const config = getAnalysisConfig(); const now = new Date().toISOString(); const mode = overrides.mode ?? "single_page";
  const options: SiteAnalysisOptions = {
    mode, testMode: "read_only", autoRunSafeTests: overrides.autoRunSafeTests ?? true,
    viewport: { width: overrides.viewport?.width ?? 1440, height: overrides.viewport?.height ?? 900 },
    timeoutMs: Math.min(overrides.timeoutMs ?? config.pageLoadTimeoutMs, 120000),
    maxPages: mode === "single_page" ? 1 : Math.min(overrides.maxPages ?? config.defaultCrawlPages, config.maxCrawlPages),
    maxDepth: mode === "single_page" ? 0 : Math.min(overrides.maxDepth ?? config.defaultCrawlDepth, config.maxCrawlDepth),
    includeQueryUrls: overrides.includeQueryUrls ?? config.crawlIncludeQueryUrls,
    respectNoFollow: overrides.respectNoFollow ?? config.crawlRespectNoFollow
  };
  const analysis: SiteAnalysis = { id: createId("analysis"), targetUrl, normalizedUrl, status: "pending", progress: 2, currentMessage: "분석 작업을 준비하고 있습니다.", options, pageIds: [], pageAnalysisIds: [], generatedTestIds: [], testRunIds: [], createdAt: now, updatedAt: now };
  if (overrides.documentAnalysis) documentByAnalysis.set(analysis.id, overrides.documentAnalysis);
  await analysisRepository.save(analysis); void runAnalysis(analysis.id).catch(() => undefined); return analysis;
}

export async function retrySiteAnalysis(id: string): Promise<SiteAnalysis> {
  if (activeAnalysisId) throw new AppError("ANALYSIS_ALREADY_RUNNING", undefined, 409);
  const previous = await requireAnalysis(id); const now = new Date().toISOString(); deduplicationByAnalysis.delete(id);
  const reset: SiteAnalysis = { ...previous, status: "pending", progress: 2, currentMessage: "재분석을 준비하고 있습니다.", pageSnapshotId: undefined, pageAnalysisId: undefined, pageIds: [], pageAnalysisIds: [], siteMapId: undefined, siteAnalysisId: undefined, crawlState: undefined, generatedTestIds: [], testRunIds: [], summary: undefined, error: undefined, startedAt: undefined, completedAt: undefined, updatedAt: now };
  await analysisRepository.save(reset); void runAnalysis(id).catch(() => undefined); return reset;
}

export async function runAnalysis(id: string): Promise<void> {
  if (activeAnalysisId && activeAnalysisId !== id) throw new AppError("ANALYSIS_ALREADY_RUNNING", undefined, 409);
  activeAnalysisId = id;
  try { const analysis = await requireAnalysis(id); if (analysis.options.mode === "site_crawl") await runSiteCrawl(analysis); else await runSinglePage(analysis); }
  catch (error) { await failAnalysis(id, error); }
  finally { if (activeAnalysisId === id) activeAnalysisId = undefined; documentByAnalysis.delete(id); }
}

async function runSinglePage(initial: SiteAnalysis) {
  const id = initial.id; let analysis = (await updateStage(id, "launching_browser", { startedAt: new Date().toISOString() }))!;
  const document = documentByAnalysis.get(id);
  const snapshot = await collectPage(id, analysis.normalizedUrl, analysis.options.viewport, analysis.options.timeoutMs, async (stage) => { await updateStage(id, stage); });
  await snapshotRepository.save(snapshot); await analysisRepository.update(id, { pageSnapshotId: snapshot.id });
  await updateStage(id, "analyzing_page"); const pageAnalysis = await analyzePageWithAi(snapshot, document); await pageAnalysisRepository.save(pageAnalysis); await analysisRepository.update(id, { pageAnalysisId: pageAnalysis.id, pageAnalysisIds: [pageAnalysis.id] });
  await updateStage(id, "generating_tests"); const tests = await generateTestsWithAi(snapshot, pageAnalysis, document); for (const test of tests) await generatedTestRepository.save(test); await analysisRepository.update(id, { generatedTestIds: tests.map((test) => test.id) });
  await updateStage(id, "running_tests"); const runs = analysis.options.autoRunSafeTests ? await executeGeneratedTests(snapshot, tests) : []; for (const run of runs) await automatedTestRunRepository.save(run);
  const summary = buildSummary(snapshot, pageAnalysis, tests, runs);
  await updateStage(id, "completed", { testRunIds: runs.map((run) => run.id), summary, completedAt: new Date().toISOString(), error: undefined });
}

async function runSiteCrawl(initial: SiteAnalysis) {
  const config = getAnalysisConfig(); const started = Date.now(); const id = initial.id; const origin = new URL(initial.normalizedUrl).origin;
  const document = documentByAnalysis.get(id);
  const queue = new CrawlQueue(initial.options.maxDepth, initial.options.maxPages, config.maxPagesPerUrlPattern);
  const edges: SiteMapEdge[] = []; const pages: CrawledPage[] = []; const snapshots = new Map<string, PageSnapshot>(); const pageByNormalized = new Map<string, CrawledPage>(); const finalUrlToPage = new Map<string, CrawledPage>(); const fingerprintToPage = new Map<string, CrawledPage>();
  const limitReasons = new Set<string>(); let skippedCount = 0; let failedCount = 0; let discoveredUrlCount = 1;
  const entryItem: CrawlQueueItem = { url: initial.normalizedUrl, normalizedUrl: initial.normalizedUrl, depth: 0, priority: { total: 100, reasons: ["시작 페이지"] }, enqueuedAt: new Date().toISOString() };
  queue.enqueue(entryItem);
  await updateStage(id, "launching_browser", { startedAt: new Date().toISOString(), crawlState: crawlState() });
  const session = await PageCollectionSession.create(initial.options.viewport);
  try {
    while (queue.size && pages.length < initial.options.maxPages) {
      if (Date.now() - started > config.crawlTotalTimeoutMs) { limitReasons.add("CRAWL_TOTAL_TIMEOUT"); break; }
      const item = queue.dequeue()!; const now = new Date().toISOString();
      const page: CrawledPage = { id: createId("crawl-page"), analysisId: id, requestedUrl: item.url, normalizedUrl: item.normalizedUrl, status: "visiting", depth: item.depth, parentPageId: item.parentPageId, discoveredFromPageIds: item.parentPageId ? [item.parentPageId] : [], discoveredFromElementIds: item.discoveredFromElementId ? [item.discoveredFromElementId] : [], priority: item.priority, urlPattern: normalizeUrlPattern(item.normalizedUrl), generatedTestIds: [], testRunIds: [], createdAt: now, startedAt: now };
      pages.push(page); pageByNormalized.set(page.normalizedUrl, page); await crawlPageRepository.save(page); await analysisRepository.update(id, { pageIds: pages.map((value) => value.id), currentMessage: item.depth === 0 ? "시작 페이지를 수집하고 있습니다." : `${item.depth}단계 페이지를 수집하고 있습니다.`, status: item.depth === 0 ? "collecting_entry_page" : "crawling_pages", progress: monotonicProgress((await requireAnalysis(id)).progress, 15, pages.length - 1, queue.size, 30), crawlState: crawlState(page.id) });
      try {
        const snapshot = await session.collect(id, item.normalizedUrl, Math.min(initial.options.timeoutMs, config.crawlPageTimeoutMs), { pageId: page.id, allowedOrigin: origin });
        if (snapshot.contentType && !snapshot.contentType.includes("text/html") && !snapshot.contentType.includes("application/xhtml")) throw new AppError("CRAWL_URL_FILTERED", "HTML 페이지가 아닌 콘텐츠는 분석하지 않습니다.");
        const fingerprint = createPageFingerprint(snapshot); snapshot.domFingerprint = fingerprint;
        const duplicate = finalUrlToPage.get(snapshot.finalUrl) || fingerprintToPage.get(fingerprint);
        if (duplicate) {
          Object.assign(page, { status: "skipped", finalUrl: snapshot.finalUrl, title: snapshot.title, aliasOfPageId: duplicate.id, skipReason: "duplicate_page", domFingerprint: fingerprint, completedAt: new Date().toISOString() }); skippedCount += 1; await crawlPageRepository.save(page); continue;
        }
        Object.assign(page, { status: snapshot.httpStatus && snapshot.httpStatus >= 400 ? "failed" : "collected", finalUrl: snapshot.finalUrl, canonicalUrl: snapshot.canonicalUrl, title: snapshot.title, snapshotId: snapshot.id, domFingerprint: fingerprint, httpStatus: snapshot.httpStatus, contentType: snapshot.contentType, completedAt: new Date().toISOString() });
        await snapshotRepository.save(snapshot); snapshots.set(page.id, snapshot); finalUrlToPage.set(snapshot.finalUrl, page); fingerprintToPage.set(fingerprint, page); if (page.status === "failed") failedCount += 1; await crawlPageRepository.save(page);
        if (page.status === "failed") continue;
        await analysisRepository.update(id, { status: "discovering_links", currentMessage: `${snapshot.title || snapshot.finalUrl}에서 내부 링크를 찾고 있습니다.`, crawlState: crawlState(page.id) });
        for (const link of snapshot.internalLinks) {
          const filtered = filterCrawlLink(link, snapshot.finalUrl, initial.normalizedUrl, initial.options); if (filtered.normalizedUrl) discoveredUrlCount += 1;
          if (!filtered.allowed || !filtered.normalizedUrl) { skippedCount += 1; edges.push(edge(page.id, link.href, link.elementId, link.text, false, filtered.reason)); continue; }
          const nextDepth = page.depth + 1; const nextItem: CrawlQueueItem = { url: filtered.normalizedUrl, normalizedUrl: filtered.normalizedUrl, depth: nextDepth, parentPageId: page.id, discoveredFromElementId: link.elementId, linkText: link.text, priority: scoreLink(link, filtered.normalizedUrl, nextDepth), enqueuedAt: new Date().toISOString() };
          const result = queue.enqueue(nextItem);
          if (result === "queued") edges.push(edge(page.id, filtered.normalizedUrl, link.elementId, link.text, true));
          else { const reason = result === "duplicate" ? "duplicate_url" : result === "depth_limit" ? "depth_limit" : result === "pattern_limit" ? "pattern_limit" : "page_limit"; skippedCount += 1; if (reason === "depth_limit") limitReasons.add("CRAWL_DEPTH_LIMIT_REACHED"); if (reason === "pattern_limit") limitReasons.add("CRAWL_PATTERN_LIMIT_REACHED"); edges.push(edge(page.id, filtered.normalizedUrl, link.elementId, link.text, false, reason)); }
        }
      } catch (error) {
        failedCount += 1; const appError = toAppError(error, "CRAWL_PAGE_FAILED"); Object.assign(page, { status: "failed", completedAt: new Date().toISOString(), error: { code: appError.code, message: appError.message, detail: appError.detail } }); await crawlPageRepository.save(page);
      }
    }
  } finally { await session.close(); }
  if (queue.size) limitReasons.add("CRAWL_PAGE_LIMIT_REACHED");
  if (!snapshots.size) throw new AppError("CRAWL_NO_VALID_PAGES", undefined, 502);

  const aiAnalyses = []; let analysisFailures = 0; await updateStage(id, "analyzing_pages", { crawlState: crawlState() });
  for (const page of pages.filter((value) => value.status === "collected")) {
    const snapshot = snapshots.get(page.id)!;
    try { const ai = await analyzePageWithAi(snapshot, document); await pageAnalysisRepository.save(ai); aiAnalyses.push(ai); page.status = "analyzed"; page.pageAnalysisId = ai.id; await crawlPageRepository.save(page); }
    catch (error) { analysisFailures += 1; page.error = { code: toAppError(error, "AI_PAGE_ANALYSIS_FAILED").code, message: toAppError(error, "AI_PAGE_ANALYSIS_FAILED").message }; await crawlPageRepository.save(page); }
  }
  await analysisRepository.update(id, { pageAnalysisIds: aiAnalyses.map((value) => value.id) });

  for (const mapEdge of edges) { const target = pageByNormalized.get(mapEdge.targetUrl) || [...pages].find((page) => page.finalUrl === mapEdge.targetUrl); if (target) mapEdge.toPageId = target.id; }
  await updateStage(id, "generating_tests"); const generated: GeneratedTestScenario[] = [];
  for (const pageAnalysis of aiAnalyses) {
    const snapshot = snapshots.get(pageAnalysis.pageId!)!;
    try { generated.push(...(await generateTestsWithAi(snapshot, pageAnalysis, document)).slice(0, config.maxTestsPerPage)); }
    catch { analysisFailures += 1; }
    if (generated.length >= config.maxTotalGeneratedTests) break;
  }
  generated.push(...generateSiteLevelTests(id, pages, snapshots, edges, config.maxSiteLevelTests));
  await updateStage(id, "deduplicating_tests"); const deduplicated = deduplicateTests(generated.slice(0, config.maxTotalGeneratedTests)); deduplicationByAnalysis.set(id, deduplicated.result);
  for (const test of deduplicated.tests) await generatedTestRepository.save(test);
  for (const page of pages) { page.generatedTestIds = deduplicated.tests.filter((test) => test.pageId === page.id).map((test) => test.id); await crawlPageRepository.save(page); }
  await analysisRepository.update(id, { generatedTestIds: deduplicated.tests.map((test) => test.id) });

  const runs: AutomatedTestRun[] = []; await updateStage(id, "running_tests");
  if (initial.options.autoRunSafeTests) {
    const runnable = deduplicated.tests.filter((test) => test.safetyLevel === "safe" && test.autoExecutable && test.confidence >= .6).sort((a, b) => b.confidence - a.confidence).slice(0, config.maxTotalAutoRunTests);
    for (const page of pages) { const snapshot = snapshots.get(page.id); if (!snapshot) continue; const pageTests = runnable.filter((test) => test.pageId === page.id); if (!pageTests.length) continue; try { runs.push(...await executeGeneratedTests(snapshot, pageTests)); } catch { analysisFailures += 1; } }
  }
  for (const run of runs) await automatedTestRunRepository.save(run);
  for (const page of pages) { page.testRunIds = runs.filter((run) => run.pageId === page.id).map((run) => run.id); await crawlPageRepository.save(page); }

  await updateStage(id, "building_report");
  for (const mapEdge of edges) { const target = pageByNormalized.get(mapEdge.targetUrl) || [...pages].find((page) => page.finalUrl === mapEdge.targetUrl); if (target) mapEdge.toPageId = target.id; }
  const siteMap = buildSiteMap(id, pages, edges, aiAnalyses); await siteMapRepository.save(siteMap);
  let siteAnalysis;
  try { siteAnalysis = aiAnalyses.length ? await analyzeSiteWithAi(id, initial.normalizedUrl, pages, aiAnalyses, siteMap) : buildSiteLevelAnalysis(id, pages, aiAnalyses, siteMap); }
  catch { analysisFailures += 1; siteAnalysis = buildSiteLevelAnalysis(id, pages, aiAnalyses, siteMap); }
  await siteLevelAnalysisRepository.save(siteAnalysis);
  const summary = buildSiteSummary(pages, snapshots, aiAnalyses, deduplicated.tests, runs, skippedCount, failedCount, analysisFailures, siteAnalysis.sitePurpose, discoveredUrlCount);
  const status: SiteAnalysisStatus = failedCount > 0 || analysisFailures > 0 ? "partially_completed" : "completed";
  await updateStage(id, status, { siteMapId: siteMap.id, siteAnalysisId: siteAnalysis.id, pageIds: pages.map((page) => page.id), pageAnalysisIds: aiAnalyses.map((item) => item.id), generatedTestIds: deduplicated.tests.map((test) => test.id), testRunIds: runs.map((run) => run.id), crawlState: crawlState(), summary, completedAt: new Date().toISOString(), error: undefined });

  function crawlState(currentPageId?: string) { return { entryUrl: initial.normalizedUrl, origin, queuedCount: queue.size, visitedCount: pages.length, skippedCount, failedCount, currentPageId, discoveredUrlCount, maxPages: initial.options.maxPages, maxDepth: initial.options.maxDepth, limitReasons: [...limitReasons] }; }
}

function edge(fromPageId: string, targetUrl: string, elementId?: string, linkText?: string, followed = false, skipReason?: SiteMapEdge["skipReason"]): SiteMapEdge { return { id: createId("edge"), fromPageId, targetUrl, elementId, linkText, followed, skipReason }; }

function buildSiteSummary(pages: CrawledPage[], snapshots: Map<string, PageSnapshot>, analyses: Array<{ primaryFunctions: unknown[] }>, tests: GeneratedTestScenario[], runs: AutomatedTestRun[], skippedPageCount: number, failedPageCount: number, analysisFailures: number, sitePurpose: string, totalDiscoveredUrls: number): SiteAnalysisSummary {
  const values = [...snapshots.values()]; const successCount = runs.filter((run) => run.status === "success").length; const failedCount = runs.filter((run) => run.status === "failed" && (!run.failureKind || run.failureKind === "product_defect")).length; const blockedCount = runs.filter((run) => run.status === "blocked").length; const errorCount = runs.filter((run) => run.failureKind === "environment_error" || (run.status === "error" && !run.failureKind)).length; const inconclusiveCount = runs.filter((run) => ["automation_limit", "inconclusive"].includes(run.failureKind || "")).length;
  const consoleErrorCount = values.flatMap((value) => value.consoleMessages).filter((item) => item.type !== "warning").length; const networkIssueCount = values.flatMap((value) => value.networkIssues).length; const brokenInternalLinkCount = pages.filter((page) => page.httpStatus === 404 || page.httpStatus === 410 || (page.httpStatus || 0) >= 500).length; const accessibilityIssueCount = values.flatMap((value) => value.elements).filter((element) => element.type === "image" && !element.accessibleName).length;
  const hasFailure = failedCount + brokenInternalLinkCount > 0; const partial = failedPageCount > 0 || analysisFailures > 0;
  return { sitePurpose, totalDiscoveredUrls, totalVisitedPages: pages.length, totalAnalyzedPages: analyses.length, skippedPageCount, failedPageCount, discoveredFunctionCount: analyses.reduce((sum, item) => sum + item.primaryFunctions.length, 0), generatedTestCount: tests.length, executedTestCount: runs.length, successCount, failedCount, blockedCount, errorCount, inconclusiveCount, consoleErrorCount, networkIssueCount, brokenInternalLinkCount, accessibilityIssueCount, overallStatus: partial ? "partially_completed" : errorCount > 0 ? "analysis_error" : hasFailure ? "failed" : consoleErrorCount + networkIssueCount + accessibilityIssueCount + inconclusiveCount > 0 ? "passed_with_warnings" : "passed" };
}

export async function getAnalysisDetail(id: string): Promise<AnalysisDetail> {
  const analysis = await requireAnalysis(id);
  const [snapshot, pageAnalysis, generatedTests, testRuns, crawlPages, siteMap, siteAnalysis] = await Promise.all([
    analysis.pageSnapshotId ? snapshotRepository.get(analysis.pageSnapshotId) : undefined, analysis.pageAnalysisId ? pageAnalysisRepository.get(analysis.pageAnalysisId) : undefined,
    generatedTestRepository.getMany(analysis.generatedTestIds), automatedTestRunRepository.getMany(analysis.testRunIds), crawlPageRepository.getMany(analysis.pageIds), analysis.siteMapId ? siteMapRepository.get(analysis.siteMapId) : undefined, analysis.siteAnalysisId ? siteLevelAnalysisRepository.get(analysis.siteAnalysisId) : undefined
  ]);
  const pages: PageDetail[] = await Promise.all(crawlPages.map(async (page) => ({ page, snapshot: page.snapshotId ? await snapshotRepository.get(page.snapshotId) : undefined, pageAnalysis: page.pageAnalysisId ? await pageAnalysisRepository.get(page.pageAnalysisId) : undefined, generatedTests: generatedTests.filter((test) => test.pageId === page.id), testRuns: testRuns.filter((run) => run.pageId === page.id) })));
  return { analysis, snapshot, pageAnalysis, generatedTests, testRuns, pages, siteMap, siteAnalysis, testDeduplication: deduplicationByAnalysis.get(id) };
}

export async function getAnalysisPageDetail(analysisId: string, pageId: string): Promise<PageDetail> { const detail = await getAnalysisDetail(analysisId); const page = detail.pages.find((value) => value.page.id === pageId); if (!page) throw new AppError("ANALYSIS_NOT_FOUND", "분석 페이지를 찾을 수 없습니다.", 404); return page; }

export async function recoverInterruptedAnalyses(): Promise<void> { const items = await analysisRepository.list(); for (const item of items.filter((analysis) => !terminal.has(analysis.status))) await analysisRepository.update(item.id, { status: "failed", progress: 100, currentMessage: "서버가 재시작되어 이전 분석을 종료했습니다. 다시 분석해 주세요.", error: { code: "ANALYSIS_PAGE_COLLECTION_FAILED", message: "서버 재시작으로 분석이 중단되었습니다." }, completedAt: new Date().toISOString() }); activeAnalysisId = undefined; }
export const listSiteAnalyses = () => analysisRepository.list(); export const getActiveAnalysisId = () => activeAnalysisId;
async function requireAnalysis(id: string): Promise<SiteAnalysis> { const analysis = await analysisRepository.get(id); if (!analysis) throw new AppError("ANALYSIS_NOT_FOUND", undefined, 404); return analysis; }
async function updateStage(id: string, status: SiteAnalysisStatus, patch: Partial<SiteAnalysis> = {}) { const stage = ANALYSIS_STAGES.find((item) => item.status === status); const current = await analysisRepository.get(id); return analysisRepository.update(id, { status, progress: Math.max(current?.progress || 0, stage?.progress ?? 100), currentMessage: stage?.message ?? ERROR_MESSAGES.ANALYSIS_PAGE_COLLECTION_FAILED, ...patch }); }
async function failAnalysis(id: string, error: unknown) { const appError = toAppError(error, "ANALYSIS_PAGE_COLLECTION_FAILED"); await analysisRepository.update(id, { status: "failed", progress: 100, currentMessage: appError.message, error: { code: appError.code, message: appError.message, detail: appError.detail }, completedAt: new Date().toISOString() }).catch(() => undefined); }
function toAppError(error: unknown, fallback: string) { return error instanceof AppError ? error : new AppError(fallback, undefined, 500, error instanceof Error ? error.message : String(error)); }
