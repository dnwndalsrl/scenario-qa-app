import type { Page } from "playwright";
import { executeAssertUrlAction } from "../actions/assert-url-action.js";
import { executeAssertVisibleAction } from "../actions/assert-visible-action.js";
import { executeClickAction } from "../actions/click-action.js";
import { executeFillAction } from "../actions/fill-action.js";
import { executeGotoAction } from "../actions/goto-action.js";
import { TestAction } from "../constants/test-action.js";
import { TestStatus } from "../constants/test-status.js";
import type {
  ActionOutcome,
  JsonValue,
  StepResult
} from "../types/result.js";
import type { TestStep } from "../types/scenario.js";
import { AssertionFailedError } from "../utils/errors.js";
import { redactJsonValue, redactText } from "../utils/redact.js";
import { captureFailureScreenshot } from "../utils/screenshot.js";

export interface StepRunnerContext {
  page: Page;
  projectRoot: string;
  screenshotsDirectory: string;
  scenarioId: string;
  baseUrl: string;
  defaultTimeout: number;
  sensitiveValues: readonly string[];
}

export async function runStep(
  step: TestStep,
  context: StepRunnerContext
): Promise<StepResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const timeout = context.defaultTimeout;

  try {
    const outcome = await executeAction(step, context, timeout);
    const finishedAtMs = Date.now();
    return {
      stepId: step.id,
      stepName: step.name,
      action: step.action,
      status: TestStatus.SUCCESS,
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      expected: redactJsonValue(outcome.expected, context.sensitiveValues),
      actual: redactJsonValue(outcome.actual, context.sensitiveValues),
      errorMessage: null,
      screenshotPath: null,
      currentUrl: safeCurrentUrl(context.page)
    };
  } catch (error: unknown) {
    const status =
      error instanceof AssertionFailedError
        ? TestStatus.FAILED
        : TestStatus.ERROR;
    const expected =
      error instanceof AssertionFailedError
        ? error.expected
        : expectedForStep(step);
    const actual =
      error instanceof AssertionFailedError ? error.actual : null;
    const rawErrorMessage =
      error instanceof Error ? error.message : String(error);
    const screenshot = await tryCaptureScreenshot(
      context,
      step,
      new Date()
    );
    const screenshotSuffix =
      screenshot.errorMessage === null
        ? ""
        : ` 스크린샷 저장 실패: ${screenshot.errorMessage}`;
    const finishedAtMs = Date.now();

    return {
      stepId: step.id,
      stepName: step.name,
      action: step.action,
      status,
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      expected: redactJsonValue(expected, context.sensitiveValues),
      actual: redactJsonValue(actual, context.sensitiveValues),
      errorMessage: redactText(
        `${rawErrorMessage}${screenshotSuffix}`,
        context.sensitiveValues
      ),
      screenshotPath: screenshot.path,
      currentUrl: safeCurrentUrl(context.page)
    };
  }
}

export function createBlockedStepResult(
  step: TestStep,
  currentUrl: string,
  sensitiveValues: readonly string[] = []
): StepResult {
  const timestamp = new Date().toISOString();
  return {
    stepId: step.id,
    stepName: step.name,
    action: step.action,
    status: TestStatus.BLOCKED,
    startedAt: timestamp,
    finishedAt: timestamp,
    durationMs: 0,
    expected: redactJsonValue(expectedForStep(step), sensitiveValues),
    actual: null,
    errorMessage: "이전 필수 단계가 실패하거나 오류가 발생하여 실행하지 않았습니다.",
    screenshotPath: null,
    currentUrl
  };
}

async function executeAction(
  step: TestStep,
  context: StepRunnerContext,
  timeout: number
): Promise<ActionOutcome> {
  switch (step.action) {
    case TestAction.GOTO:
      return executeGotoAction(
        context.page,
        step,
        context.baseUrl,
        timeout
      );
    case TestAction.FILL:
      return executeFillAction(context.page, step, timeout);
    case TestAction.CLICK:
      return executeClickAction(context.page, step, timeout);
    case TestAction.ASSERT_URL:
      return executeAssertUrlAction(context.page, step, timeout);
    case TestAction.ASSERT_VISIBLE:
      return executeAssertVisibleAction(context.page, step, timeout);
  }
}

function expectedForStep(step: TestStep): JsonValue {
  switch (step.action) {
    case TestAction.GOTO:
      return { requestedUrl: step.value };
    case TestAction.FILL:
      return {
        inputValue: step.sensitive === true ? "[REDACTED]" : step.value
      };
    case TestAction.CLICK:
      return { clicked: true };
    case TestAction.ASSERT_URL:
      return {
        operator: step.expected.operator,
        value: step.expected.value
      };
    case TestAction.ASSERT_VISIBLE:
      return {
        visible: true,
        target: step.target.value
      };
  }
}

function safeCurrentUrl(page: Page): string {
  try {
    return page.url();
  } catch {
    return "";
  }
}

interface ScreenshotAttempt {
  path: string | null;
  errorMessage: string | null;
}

async function tryCaptureScreenshot(
  context: StepRunnerContext,
  step: TestStep,
  capturedAt: Date
): Promise<ScreenshotAttempt> {
  try {
    const screenshotPath = await captureFailureScreenshot(
      context.page,
      context.projectRoot,
      context.screenshotsDirectory,
      context.scenarioId,
      step.id,
      capturedAt,
      context.sensitiveValues
    );
    return {
      path: screenshotPath,
      errorMessage: null
    };
  } catch (error: unknown) {
    return {
      path: null,
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}
