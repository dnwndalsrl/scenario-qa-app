import path from "node:path";

const positive = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function getAnalysisConfig() {
  return {
    storageRoot: path.resolve(process.env.NUXT_STORAGE_ROOT || path.join(process.cwd(), "storage")),
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    pageAnalysisModel: process.env.OPENAI_PAGE_ANALYSIS_MODEL || "gpt-5-mini",
    testGenerationModel: process.env.OPENAI_TEST_GENERATION_MODEL || "gpt-5-mini",
    pageAnalysisPromptVersion: process.env.OPENAI_PAGE_ANALYSIS_PROMPT_VERSION || "v1",
    testGenerationPromptVersion: process.env.OPENAI_TEST_GENERATION_PROMPT_VERSION || "v1",
    allowLocalTargets: process.env.ALLOW_LOCAL_TEST_TARGETS === "true",
    allowedLocalPorts: (process.env.ALLOWED_LOCAL_TEST_PORTS || "3000,3001").split(",").map(Number).filter(Number.isInteger),
    maxConcurrentAnalyses: positive(process.env.MAX_CONCURRENT_ANALYSES, 1),
    maxAnalysisExecutionMs: positive(process.env.MAX_ANALYSIS_EXECUTION_MS, 180000),
    pageLoadTimeoutMs: positive(process.env.PAGE_LOAD_TIMEOUT_MS, 30000),
    testStepTimeoutMs: positive(process.env.TEST_STEP_TIMEOUT_MS, 10000),
    maxDiscoveredElements: positive(process.env.MAX_DISCOVERED_ELEMENTS, 200),
    maxInternalLinks: positive(process.env.MAX_INTERNAL_LINKS, 100),
    maxGeneratedScenarios: positive(process.env.MAX_GENERATED_SCENARIOS, 10),
    maxStepsPerScenario: positive(process.env.MAX_STEPS_PER_SCENARIO, 10),
    maxCrawlPages: positive(process.env.MAX_CRAWL_PAGES, 10),
    defaultCrawlPages: positive(process.env.DEFAULT_CRAWL_PAGES, 5),
    maxCrawlDepth: positive(process.env.MAX_CRAWL_DEPTH, 3),
    defaultCrawlDepth: positive(process.env.DEFAULT_CRAWL_DEPTH, 2),
    maxPagesPerUrlPattern: positive(process.env.MAX_PAGES_PER_URL_PATTERN, 2),
    maxTestsPerPage: positive(process.env.MAX_TESTS_PER_PAGE, 5),
    maxSiteLevelTests: positive(process.env.MAX_SITE_LEVEL_TESTS, 10),
    maxTotalGeneratedTests: positive(process.env.MAX_TOTAL_GENERATED_TESTS, 30),
    maxTotalAutoRunTests: positive(process.env.MAX_TOTAL_AUTO_RUN_TESTS, 20),
    crawlPageTimeoutMs: positive(process.env.CRAWL_PAGE_TIMEOUT_MS, 30000),
    crawlTotalTimeoutMs: positive(process.env.CRAWL_TOTAL_TIMEOUT_MS, 300000),
    crawlRespectNoFollow: process.env.CRAWL_RESPECT_NOFOLLOW !== "false",
    crawlIncludeQueryUrls: process.env.CRAWL_INCLUDE_QUERY_URLS === "true",
    maxTotalDiscoveredElements: positive(process.env.MAX_TOTAL_DISCOVERED_ELEMENTS, 1000),
    maxScreenshotsPerAnalysis: positive(process.env.MAX_SCREENSHOTS_PER_ANALYSIS, 20),
    maxTotalVisibleTextLength: positive(process.env.MAX_TOTAL_VISIBLE_TEXT_LENGTH, 20000),
    screenshotEnabled: process.env.ANALYSIS_SCREENSHOT_ENABLED !== "false",
    artifactMaxBytes: positive(process.env.ANALYSIS_ARTIFACT_MAX_SIZE_MB, 10) * 1024 * 1024
  };
}
