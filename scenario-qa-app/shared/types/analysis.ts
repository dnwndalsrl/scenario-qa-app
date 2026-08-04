export type AnalysisMode = "single_page" | "site_crawl";
export type SiteAnalysisStatus =
  | "pending" | "launching_browser" | "loading_entry_page" | "loading_page" | "collecting_entry_page" | "collecting_page"
  | "discovering_links" | "crawling_pages" | "analyzing_page" | "analyzing_pages" | "generating_tests"
  | "deduplicating_tests" | "running_tests" | "building_report" | "completed" | "partially_completed" | "failed";

export type PageType = "landing" | "login" | "signup" | "search" | "list" | "detail" | "dashboard" | "form" | "settings" | "article" | "unknown";
export type TestSafetyLevel = "safe" | "review_required" | "blocked";
export type TestRunStatus = "pending" | "running" | "success" | "failed" | "blocked" | "error";
export type GeneratedTestAction = "goto" | "assert_url" | "assert_title" | "assert_visible" | "assert_enabled" | "assert_text" | "click" | "fill" | "select" | "press" | "check" | "uncheck";
export type LocatorStrategy = "test_id" | "role" | "label" | "placeholder" | "text" | "css";
export type DiscoveredElementType = "link" | "button" | "input" | "textarea" | "select" | "checkbox" | "radio" | "form" | "heading" | "navigation" | "table" | "dialog" | "tab" | "alert" | "image" | "other";
export type CrawlPageStatus = "queued" | "visiting" | "collected" | "analyzed" | "failed" | "skipped";
export type CrawlSkipReason = "external_origin" | "duplicate_url" | "depth_limit" | "page_limit" | "blocked_protocol" | "dangerous_path" | "download_link" | "mailto" | "telephone" | "fragment_only" | "nofollow" | "logout" | "unsupported_content" | "redirect" | "pattern_limit" | "duplicate_page" | "manual";

export interface AnalysisError { code: string; message: string; detail?: string; }
export interface SiteAnalysisOptions {
  mode: AnalysisMode; testMode: "read_only"; autoRunSafeTests: boolean;
  viewport: { width: number; height: number }; timeoutMs: number;
  maxPages: number; maxDepth: number; includeQueryUrls: boolean; respectNoFollow: boolean;
}
export interface AnalysisSummary {
  pageType?: PageType; pagePurpose?: string; discoveredElementCount: number; discoveredFunctionCount: number;
  generatedTestCount: number; executedTestCount: number; successCount: number; failedCount: number; blockedCount: number; errorCount: number;
  consoleErrorCount: number; networkIssueCount: number; criticalIssueCount: number; warningCount: number;
  overallStatus: "passed" | "passed_with_warnings" | "failed" | "analysis_error";
}
export interface SiteAnalysisSummary {
  sitePurpose?: string; totalDiscoveredUrls: number; totalVisitedPages: number; totalAnalyzedPages: number; skippedPageCount: number; failedPageCount: number;
  discoveredFunctionCount: number; generatedTestCount: number; executedTestCount: number; successCount: number; failedCount: number; blockedCount: number; errorCount: number;
  consoleErrorCount: number; networkIssueCount: number; brokenInternalLinkCount: number; accessibilityIssueCount: number;
  overallStatus: "passed" | "passed_with_warnings" | "failed" | "partially_completed" | "analysis_error";
}
export interface CrawlState {
  entryUrl: string; origin: string; queuedCount: number; visitedCount: number; skippedCount: number; failedCount: number;
  currentPageId?: string; discoveredUrlCount: number; maxPages: number; maxDepth: number; limitReasons: string[];
}
export interface SiteAnalysis {
  id: string; targetUrl: string; normalizedUrl: string; status: SiteAnalysisStatus; progress: number; currentMessage?: string;
  options: SiteAnalysisOptions; pageSnapshotId?: string; pageAnalysisId?: string; pageIds: string[]; pageAnalysisIds: string[];
  siteMapId?: string; siteAnalysisId?: string; generatedTestIds: string[]; testRunIds: string[]; crawlState?: CrawlState;
  summary?: AnalysisSummary | SiteAnalysisSummary; error?: AnalysisError; createdAt: string; startedAt?: string; completedAt?: string; updatedAt: string;
}
export interface LinkPriorityScore { total: number; reasons: string[]; }
export interface CrawlQueueItem {
  url: string; normalizedUrl: string; depth: number; parentPageId?: string; discoveredFromElementId?: string; linkText?: string;
  priority: LinkPriorityScore; enqueuedAt: string;
}
export interface CrawledPage {
  id: string; analysisId: string; requestedUrl: string; normalizedUrl: string; finalUrl?: string; canonicalUrl?: string; title?: string;
  status: CrawlPageStatus; depth: number; parentPageId?: string; discoveredFromPageIds: string[]; discoveredFromElementIds: string[];
  priority: LinkPriorityScore; urlPattern: string; skipReason?: CrawlSkipReason; snapshotId?: string; pageAnalysisId?: string;
  generatedTestIds: string[]; testRunIds: string[]; domFingerprint?: string; aliasOfPageId?: string; httpStatus?: number; contentType?: string;
  createdAt: string; startedAt?: string; completedAt?: string; error?: AnalysisError;
}
export interface SiteMapNode { pageId: string; url: string; title?: string; depth: number; pageType?: PageType; status: CrawlPageStatus; importance: number; aliasOfPageId?: string; }
export interface SiteMapEdge { id: string; fromPageId: string; toPageId?: string; targetUrl: string; elementId?: string; linkText?: string; followed: boolean; skipReason?: CrawlSkipReason; }
export interface SiteMap { id: string; analysisId: string; entryPageId: string; nodes: SiteMapNode[]; edges: SiteMapEdge[]; generatedAt: string; }
export interface PageGroup { id: string; name: string; pageIds: string[]; pageType?: PageType; }
export interface DiscoveredUserFlow { id: string; name: string; description: string; pageIds: string[]; confidence: number; safetyLevel: TestSafetyLevel; }
export interface SiteRisk { id: string; title: string; description: string; severity: "low" | "medium" | "high"; pageIds: string[]; }
export interface AiSiteAnalysis { id: string; analysisId: string; sitePurpose: string; primaryUserFlows: DiscoveredUserFlow[]; mainPageGroups: PageGroup[]; coverageSummary: string; risks: SiteRisk[]; limitations: string[]; confidence: number; generatedAt: string; }

export interface LocatorCandidate { strategy: LocatorStrategy; value: string; score: number; unique: boolean; }
export interface DiscoveredElement {
  id: string; type: DiscoveredElementType; tagName: string; role?: string; accessibleName?: string; label?: string; text?: string;
  placeholder?: string; testId?: string; href?: string; inputType?: string; visible: boolean; enabled?: boolean; required?: boolean;
  readonly?: boolean; locatorCandidates: LocatorCandidate[]; safetyHints: string[];
}
export interface PageHeading { level: number; text: string; elementId: string; }
export interface DiscoveredForm { elementId: string; method: string; action?: string; fieldElementIds: string[]; }
export interface DiscoveredLink { elementId: string; href: string; text?: string; accessibleName?: string; internal: boolean; noFollow?: boolean; download?: boolean; region?: "header" | "main" | "footer" | "other"; visible?: boolean; }
export interface CapturedConsoleMessage { id: string; type: "error" | "warning" | "pageerror"; text: string; recordedAt: string; }
export interface CapturedNetworkIssue { id: string; url: string; method: string; resourceType: string; status?: number; failureText?: string; recordedAt: string; }
export interface PageSnapshot {
  id: string; analysisId: string; pageId?: string; requestedUrl: string; finalUrl: string; canonicalUrl?: string; title: string; description?: string; language?: string;
  httpStatus?: number; contentType?: string; viewport: { width: number; height: number }; headings: PageHeading[]; elements: DiscoveredElement[]; forms: DiscoveredForm[];
  internalLinks: DiscoveredLink[]; consoleMessages: CapturedConsoleMessage[]; networkIssues: CapturedNetworkIssue[]; domFingerprint?: string;
  screenshotArtifactId?: string; collectedAt: string;
}
export interface DiscoveredFunction { id: string; name: string; description: string; relatedElementIds: string[]; confidence: number; }
export interface PageRisk { id: string; title: string; description: string; severity: "low" | "medium" | "high"; relatedElementIds: string[]; }
export interface TestOpportunity { id: string; title: string; description: string; relatedElementIds: string[]; }
export interface AiPageAnalysis {
  id: string; analysisId: string; pageId?: string; pageType: PageType; pagePurpose: string; primaryFunctions: DiscoveredFunction[]; risks: PageRisk[];
  testOpportunities: TestOpportunity[]; confidence: number; limitations: string[]; model: string; promptVersion: string; inputCharacters: number; generatedAt: string;
}
export interface GeneratedTestStep {
  id: string; order: number; action: GeneratedTestAction; description: string; elementId?: string; locator?: LocatorCandidate;
  value?: string; expected?: string; timeoutMs?: number; evidence: string[];
}
export interface GeneratedTestScenario {
  id: string; analysisId: string; pageId?: string; title: string; description: string; purpose: string;
  category: "page_load" | "navigation" | "visibility" | "accessibility" | "form_validation" | "search" | "interaction" | "error_detection";
  safetyLevel: TestSafetyLevel; safetyReasons: string[]; confidence: number; autoExecutable: boolean; sourceElementIds: string[];
  steps: GeneratedTestStep[]; generatedAt: string;
}
export interface DuplicateTestGroup { fingerprint: string; keptTestId: string; removedTestIds: string[]; }
export interface TestDeduplicationResult { originalCount: number; deduplicatedCount: number; removedCount: number; groups: DuplicateTestGroup[]; }
export interface AutomatedStepResult {
  stepId: string; order: number; action: GeneratedTestAction; description: string; status: TestRunStatus; expected?: string; actual?: string;
  currentUrl?: string; screenshotArtifactId?: string; errorMessage?: string; startedAt?: string; completedAt?: string; durationMs?: number;
}
export interface AutomatedTestRun {
  id: string; analysisId: string; pageId?: string; scenarioId: string; status: TestRunStatus; stepResults: AutomatedStepResult[];
  consoleIssues: CapturedConsoleMessage[]; networkIssues: CapturedNetworkIssue[]; screenshotArtifactIds: string[];
  startedAt?: string; completedAt?: string; durationMs?: number; error?: AnalysisError;
}
export interface PageDetail { page: CrawledPage; snapshot?: PageSnapshot; pageAnalysis?: AiPageAnalysis; generatedTests: GeneratedTestScenario[]; testRuns: AutomatedTestRun[]; }
export interface AnalysisDetail {
  analysis: SiteAnalysis; snapshot?: PageSnapshot; pageAnalysis?: AiPageAnalysis; generatedTests: GeneratedTestScenario[]; testRuns: AutomatedTestRun[];
  pages: PageDetail[]; siteMap?: SiteMap; siteAnalysis?: AiSiteAnalysis; testDeduplication?: TestDeduplicationResult;
}

export const ANALYSIS_STAGES: Array<{ status: SiteAnalysisStatus; progress: number; message: string }> = [
  { status: "pending", progress: 2, message: "분석 작업을 준비하고 있습니다." },
  { status: "launching_browser", progress: 5, message: "브라우저를 준비하고 있습니다." },
  { status: "loading_entry_page", progress: 10, message: "시작 페이지에 접속하고 있습니다." },
  { status: "collecting_entry_page", progress: 15, message: "시작 페이지 구조를 수집하고 있습니다." },
  { status: "discovering_links", progress: 25, message: "안전한 내부 링크를 찾고 있습니다." },
  { status: "crawling_pages", progress: 45, message: "동일 사이트의 주요 페이지를 탐색하고 있습니다." },
  { status: "analyzing_pages", progress: 65, message: "AI가 페이지별 기능을 분석하고 있습니다." },
  { status: "generating_tests", progress: 75, message: "페이지별 테스트를 생성하고 있습니다." },
  { status: "deduplicating_tests", progress: 80, message: "중복 테스트를 정리하고 있습니다." },
  { status: "running_tests", progress: 90, message: "안전한 테스트를 순차 실행하고 있습니다." },
  { status: "building_report", progress: 96, message: "사이트 QA 보고서를 구성하고 있습니다." },
  { status: "completed", progress: 100, message: "QA 보고서가 완성되었습니다." },
  { status: "partially_completed", progress: 100, message: "일부 페이지를 제외하고 QA 보고서를 완성했습니다." }
];
