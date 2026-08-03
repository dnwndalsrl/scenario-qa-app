import path from "node:path";
import { chromium } from "playwright";
import { attachConsoleCollector } from "../collectors/console-collector.js";
import { attachNetworkCollector } from "../collectors/network-collector.js";
import { TestStatus } from "../constants/test-status.js";
import type {
  ScenarioResult,
  ScenarioRunOutput,
  StepResult
} from "../types/result.js";
import type { TestScenario } from "../types/scenario.js";
import {
  safeFileSegment,
  timestampForFile,
  writeJsonFileAtomic
} from "../utils/file.js";
import { captureFailureScreenshot, resetScreenshotBudget } from "../utils/screenshot.js";
import {
  createBlockedStepResult,
  runStep
} from "./step-runner.js";

export interface ScenarioRunnerOptions {
  projectRoot: string;
  artifactsDirectory: string;
  headless: boolean;
  sensitiveValues: readonly string[];
  validateNavigationUrl?: (value: string) => void;
  browserLaunchArgs?: string[];
}

export async function runScenario(
  scenario: TestScenario,
  options: ScenarioRunnerOptions
): Promise<ScenarioRunOutput> {
  validateStartUrl(scenario.startUrl);
  options.validateNavigationUrl?.(scenario.startUrl);
  const startedAtMs = Date.now();
  const browser = await chromium.launch({
    headless: options.headless,
    ...(options.browserLaunchArgs?.length ? { args: options.browserLaunchArgs } : {})
  });
  resetScreenshotBudget();
  const viewport = { width: 1440, height: 900 };
  const context = await browser.newContext({
    baseURL: scenario.startUrl,
    acceptDownloads: false,
    viewport,
    permissions: []
  });
  if (options.validateNavigationUrl !== undefined) {
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (request.isNavigationRequest() && request.resourceType() === "document") {
        try {
          options.validateNavigationUrl?.(request.url());
        } catch {
          await route.abort("blockedbyclient");
          return;
        }
      }
      await route.continue();
    });
  }
  context.setDefaultTimeout(scenario.timeout);
  context.setDefaultNavigationTimeout(scenario.timeout);
  const page = await context.newPage();
  const consoleCollector = attachConsoleCollector(
    page,
    options.sensitiveValues
  );
  const networkCollector = attachNetworkCollector(
    page,
    options.sensitiveValues
  );
  const screenshotsDirectory = path.join(
    options.artifactsDirectory,
    "screenshots"
  );
  const stepResults: StepResult[] = [];
  let blockRemainingSteps = false;

  try {
    for (const step of [...scenario.steps].sort(
      (left, right) => left.order - right.order
    )) {
      if (blockRemainingSteps) {
        stepResults.push(createBlockedStepResult(step, page.url(), options.sensitiveValues));
        continue;
      }

      const elapsedMs = Date.now() - startedAtMs;
      const remainingScenarioTime = scenario.timeout - elapsedMs;
      if (remainingScenarioTime <= 0) {
        const timeoutResult = await createScenarioTimeoutResult(
          step,
          page.url(),
          page,
          options.projectRoot,
          screenshotsDirectory,
          scenario.id,
          options.sensitiveValues
        );
        stepResults.push(timeoutResult);
        if (scenario.stopOnFailure && step.required) {
          blockRemainingSteps = true;
        }
        continue;
      }

      const stepResult = await runStep(step, {
        page,
        projectRoot: options.projectRoot,
        screenshotsDirectory,
        scenarioId: scenario.id,
        baseUrl: scenario.startUrl,
        defaultTimeout: Math.min(
          step.timeout ?? scenario.timeout,
          remainingScenarioTime
        ),
        sensitiveValues: options.sensitiveValues
      });
      stepResults.push(stepResult);

      const isFailure =
        stepResult.status === TestStatus.FAILED ||
        stepResult.status === TestStatus.ERROR;
      if (
        scenario.stopOnFailure &&
        step.required &&
        isFailure
      ) {
        blockRemainingSteps = true;
      }
    }
  } finally {
    consoleCollector.dispose();
    networkCollector.dispose();
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  const finishedAtMs = Date.now();
  const result = buildScenarioResult(
    scenario,
    stepResults,
    consoleCollector.entries,
    networkCollector.entries,
    startedAtMs,
    finishedAtMs,
    {
      name: "chromium",
      version: browser.version(),
      viewport,
      headless: options.headless
    }
  );
  const resultPath = await saveScenarioResult(
    result,
    options.projectRoot,
    options.artifactsDirectory
  );

  return { result, resultPath };
}

function buildScenarioResult(
  scenario: TestScenario,
  steps: StepResult[],
  consoleLogs: ScenarioResult["consoleLogs"],
  networkErrors: ScenarioResult["networkErrors"],
  startedAtMs: number,
  finishedAtMs: number
  ,browserInfo: ScenarioResult["browserInfo"]
): ScenarioResult {
  const successCount = countStatus(steps, TestStatus.SUCCESS);
  const failedCount = countStatus(steps, TestStatus.FAILED);
  const blockedCount = countStatus(steps, TestStatus.BLOCKED);
  const errorCount = countStatus(steps, TestStatus.ERROR);

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    status: summarizeStatus(
      successCount,
      failedCount,
      blockedCount,
      errorCount
    ),
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - startedAtMs,
    totalSteps: steps.length,
    successCount,
    failedCount,
    blockedCount,
    errorCount,
    steps,
    consoleLogs,
    networkErrors
    ,browserInfo
  };
}

function summarizeStatus(
  successCount: number,
  failedCount: number,
  blockedCount: number,
  errorCount: number
): TestStatus {
  if (errorCount > 0) {
    return TestStatus.ERROR;
  }
  if (failedCount > 0) {
    return TestStatus.FAILED;
  }
  if (blockedCount > 0) {
    return TestStatus.BLOCKED;
  }
  return successCount > 0 ? TestStatus.SUCCESS : TestStatus.ERROR;
}

function countStatus(steps: StepResult[], status: TestStatus): number {
  return steps.filter((step) => step.status === status).length;
}

async function createScenarioTimeoutResult(
  step: TestScenario["steps"][number],
  currentUrl: string,
  page: Parameters<typeof captureFailureScreenshot>[0],
  projectRoot: string,
  screenshotsDirectory: string,
  scenarioId: string,
  sensitiveValues: readonly string[]
): Promise<StepResult> {
  const now = new Date();
  const timestamp = now.toISOString();
  let screenshotPath: string | null = null;
  let screenshotError = "";
  try {
    screenshotPath = await captureFailureScreenshot(
      page,
      projectRoot,
      screenshotsDirectory,
      scenarioId,
      step.id,
      now,
      sensitiveValues
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    screenshotError = ` 스크린샷 저장 실패: ${message}`;
  }
  return {
    stepId: step.id,
    stepName: step.name,
    action: step.action,
    status: TestStatus.ERROR,
    startedAt: timestamp,
    finishedAt: timestamp,
    durationMs: 0,
    expected: null,
    actual: null,
    errorMessage: `시나리오 전체 제한 시간을 초과했습니다.${screenshotError}`,
    screenshotPath,
    currentUrl
  };
}

async function saveScenarioResult(
  result: ScenarioResult,
  projectRoot: string,
  artifactsDirectory: string
): Promise<string> {
  const resultsDirectory = path.join(artifactsDirectory, "results");
  const filename = [
    safeFileSegment(result.scenarioId),
    timestampForFile(new Date(result.startedAt))
  ].join("__");
  const absolutePath = path.join(resultsDirectory, `${filename}.json`);
  await writeJsonFileAtomic(absolutePath, result);
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}

function validateStartUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`startUrl이 유효하지 않습니다: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("startUrl은 HTTP 또는 HTTPS URL이어야 합니다.");
  }
}
