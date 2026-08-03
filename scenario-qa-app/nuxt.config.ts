import { readlink as nodeReadlink } from "node:fs/promises";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function safeReadlink(filePath: string): Promise<string | null> {
  try {
    return await nodeReadlink(filePath);
  } catch (error: unknown) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
    if (["EINVAL", "ENOENT", "EPERM", "EACCES"].includes(code)) return null;
    throw error;
  }
}

function nonNegativeNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function rate(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : fallback;
}

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  srcDir: ".",
  buildDir: ".nuxt",
  devtools: { enabled: true },
  modules: ["@pinia/nuxt"],
  components: [
    {
      path: "~/components",
      pathPrefix: false
    }
  ],
  css: [
    "element-plus/dist/index.css",
    "~/assets/scss/reset.scss",
    "~/assets/scss/main.scss"
  ],
  devServer: {
    port: 3100
  },
  typescript: {
    strict: true,
    typeCheck: true
  },
  runtimeConfig: {
    storageRoot: "",
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    openaiScenarioModel: process.env.OPENAI_SCENARIO_MODEL ?? "",
    openaiScenarioPromptVersion:
      process.env.OPENAI_SCENARIO_PROMPT_VERSION ?? "v1",
    aiScenarioMaxInputLength: positiveInteger(
      process.env.AI_SCENARIO_MAX_INPUT_LENGTH,
      10000
    ),
    aiScenarioMaxSteps: positiveInteger(
      process.env.AI_SCENARIO_MAX_STEPS,
      50
    ),
    aiScenarioTimeoutMs: positiveInteger(
      process.env.AI_SCENARIO_TIMEOUT_MS,
      60000
    ),
    openaiFailureAnalysisModel:
      process.env.OPENAI_FAILURE_ANALYSIS_MODEL ?? "",
    openaiFailureAnalysisPromptVersion:
      process.env.OPENAI_FAILURE_ANALYSIS_PROMPT_VERSION ?? "v1",
    aiFailureAnalysisTimeoutMs: positiveInteger(
      process.env.AI_FAILURE_ANALYSIS_TIMEOUT_MS,
      60000
    ),
    aiFailureAnalysisMaxCauses: positiveInteger(
      process.env.AI_FAILURE_ANALYSIS_MAX_CAUSES,
      5
    ),
    aiFailureAnalysisMaxActions: positiveInteger(
      process.env.AI_FAILURE_ANALYSIS_MAX_ACTIONS,
      8
    ),
    aiFailureAnalysisMaxChecks: positiveInteger(
      process.env.AI_FAILURE_ANALYSIS_MAX_CHECKS,
      8
    ),
    aiAnalysisMaxFailedSteps: positiveInteger(
      process.env.AI_ANALYSIS_MAX_FAILED_STEPS,
      20
    ),
    aiAnalysisMaxConsoleErrors: positiveInteger(
      process.env.AI_ANALYSIS_MAX_CONSOLE_ERRORS,
      30
    ),
    aiAnalysisMaxNetworkErrors: positiveInteger(
      process.env.AI_ANALYSIS_MAX_NETWORK_ERRORS,
      30
    ),
    aiAnalysisMaxMessageLength: positiveInteger(
      process.env.AI_ANALYSIS_MAX_MESSAGE_LENGTH,
      2000
    ),
    aiAnalysisMaxTotalInputLength: positiveInteger(
      process.env.AI_ANALYSIS_MAX_TOTAL_INPUT_LENGTH,
      30000
    ),
    testRunComparisonVersion:
      process.env.TEST_RUN_COMPARISON_VERSION ?? "v1",
    regressionDurationWarningRate: rate(
      process.env.REGRESSION_DURATION_WARNING_RATE,
      0.3
    ),
    regressionDurationCriticalRate: rate(
      process.env.REGRESSION_DURATION_CRITICAL_RATE,
      0.8
    ),
    regressionDurationMinDifferenceMs: nonNegativeNumber(
      process.env.REGRESSION_DURATION_MIN_DIFFERENCE_MS,
      500
    ),
    regressionDurationCriticalDifferenceMs: nonNegativeNumber(
      process.env.REGRESSION_DURATION_CRITICAL_DIFFERENCE_MS,
      1000
    ),
    regressionStepMatchMinConfidence: rate(
      process.env.REGRESSION_STEP_MATCH_MIN_CONFIDENCE,
      0.8
    ),
    regressionMaxConsoleItems: positiveInteger(
      process.env.REGRESSION_MAX_CONSOLE_ITEMS,
      100
    ),
    regressionMaxNetworkItems: positiveInteger(
      process.env.REGRESSION_MAX_NETWORK_ITEMS,
      100
    ),
    testSuiteMaxItems: positiveInteger(
      process.env.TEST_SUITE_MAX_ITEMS,
      50
    ),
    testSuitePollIntervalMs: positiveInteger(
      process.env.TEST_SUITE_POLL_INTERVAL_MS,
      2000
    ),
    testSuiteMaxExecutionMs: positiveInteger(
      process.env.TEST_SUITE_MAX_EXECUTION_MS,
      1800000
    ),
    testSuiteAllowConcurrentRuns:
      process.env.TEST_SUITE_ALLOW_CONCURRENT_RUNS === "true",
    testSuiteRunVersion:
      process.env.TEST_SUITE_RUN_VERSION ?? "v1",
    testSchedulerEnabled: process.env.TEST_SCHEDULER_ENABLED !== "false",
    testSchedulerTickIntervalMs: positiveInteger(process.env.TEST_SCHEDULER_TICK_INTERVAL_MS, 15000),
    testScheduleDefaultTimezone: process.env.TEST_SCHEDULE_DEFAULT_TIMEZONE ?? "Asia/Seoul",
    testScheduleMaxPerSuite: positiveInteger(process.env.TEST_SCHEDULE_MAX_PER_SUITE, 10),
    testScheduleMaxPerProject: positiveInteger(process.env.TEST_SCHEDULE_MAX_PER_PROJECT, 100),
    testScheduleMinIntervalMinutes: positiveInteger(process.env.TEST_SCHEDULE_MIN_INTERVAL_MINUTES, 15),
    testScheduleExecutionVersion: process.env.TEST_SCHEDULE_EXECUTION_VERSION ?? "v1",
    appBaseUrl: process.env.NOTIFICATION_APP_BASE_URL ?? process.env.APP_BASE_URL ?? "http://127.0.0.1:3100",
    notificationEmailProvider: process.env.NOTIFICATION_EMAIL_PROVIDER ?? "disabled",
    notificationEmailFrom: process.env.NOTIFICATION_EMAIL_FROM ?? "",
    smtpHost: process.env.SMTP_HOST ?? "",
    smtpPort: positiveInteger(process.env.SMTP_PORT, 587),
    smtpSecure: process.env.SMTP_SECURE === "true",
    smtpUser: process.env.SMTP_USER ?? "",
    smtpPassword: process.env.SMTP_PASSWORD ?? "",
    notificationEncryptionKey: process.env.NOTIFICATION_ENCRYPTION_KEY ?? "",
    notificationMaxRetryCount: positiveInteger(process.env.NOTIFICATION_MAX_RETRY_COUNT, 3),
    notificationRetryDelayMs: positiveInteger(process.env.NOTIFICATION_RETRY_DELAY_MS, 5000),
    analyticsVersion: process.env.ANALYTICS_VERSION ?? "v1",
    analyticsDefaultRangeDays: positiveInteger(process.env.DEFAULT_RANGE_DAYS, 30),
    analyticsMaxRangeDays: positiveInteger(process.env.MAX_RANGE_DAYS, 730),
    analyticsCacheTtlMs: positiveInteger(process.env.CACHE_TTL_MS, 60000),
    analyticsMaxTimeseriesPoints: positiveInteger(process.env.MAX_TIMESERIES_POINTS, 400),
    analyticsTopScenariosLimit: positiveInteger(process.env.TOP_SCENARIOS_LIMIT, 20),
    analyticsTopStepsLimit: positiveInteger(process.env.TOP_STEPS_LIMIT, 20),
    analyticsTopErrorsLimit: positiveInteger(process.env.TOP_ERRORS_LIMIT, 20),
    analyticsRecentIssuesLimit: positiveInteger(process.env.RECENT_ISSUES_LIMIT, 20),
    analyticsMinSampleForTrend: positiveInteger(process.env.MIN_SAMPLE_FOR_TREND, 5),
    analyticsSuccessWarning: rate(process.env.QUALITY_SUCCESS_WARNING, 0.95),
    analyticsSuccessDanger: rate(process.env.QUALITY_SUCCESS_DANGER, 0.8),
    analyticsRegressionWarning: rate(process.env.QUALITY_REGRESSION_WARNING, 0.05),
    analyticsRegressionDanger: rate(process.env.QUALITY_REGRESSION_DANGER, 0.15),
    analyticsErrorWarning: rate(process.env.QUALITY_ERROR_WARNING, 0.02),
    analyticsErrorDanger: rate(process.env.QUALITY_ERROR_DANGER, 0.1),
    qualityScoreEnabled: process.env.QUALITY_SCORE_ENABLED === "true",
    openaiQualitySummaryModel: process.env.OPENAI_QUALITY_SUMMARY_MODEL ?? "",
    openaiQualitySummaryPromptVersion: process.env.OPENAI_QUALITY_SUMMARY_PROMPT_VERSION ?? "v1",
    public: {
      appAuthEnabled: process.env.APP_AUTH_ENABLED === "true",
      deploymentMode: process.env.APP_DEPLOYMENT_MODE ?? "local",
      demoMode: process.env.APP_DEMO_MODE === "true",
      persistentStorage: process.env.PERSISTENT_STORAGE_AVAILABLE === "true",
      pollingIntervalMs: 2000,
      pollingTimeoutMs: 600000,
      testSuitePollingIntervalMs: positiveInteger(
        process.env.TEST_SUITE_POLL_INTERVAL_MS,
        2000
      ),
      testSuitePollingTimeoutMs:
        positiveInteger(process.env.TEST_SUITE_MAX_EXECUTION_MS, 1800000) +
        60000,
      regressionDurationWarningRate: rate(
        process.env.REGRESSION_DURATION_WARNING_RATE,
        0.3
      ),
      regressionDurationCriticalRate: rate(
        process.env.REGRESSION_DURATION_CRITICAL_RATE,
        0.8
      ),
      regressionDurationMinDifferenceMs: nonNegativeNumber(
        process.env.REGRESSION_DURATION_MIN_DIFFERENCE_MS,
        500
      ),
      regressionDurationCriticalDifferenceMs: nonNegativeNumber(
        process.env.REGRESSION_DURATION_CRITICAL_DIFFERENCE_MS,
        1000
      )
    }
  },
  nitro: {
    compressPublicAssets: true,
    externals: {
      inline: ["scenario-test-runner"],
      traceOptions: {
        readlink: safeReadlink
      }
    }
  },
  app: {
    head: {
      title: "Scenario QA",
      meta: [
        {
          name: "description",
          content: "Playwright 시나리오 실행과 결과 확인을 위한 로컬 QA 관리 도구"
        }
      ]
    }
  }
});
