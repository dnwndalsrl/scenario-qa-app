import { errors as playwrightErrors, type Page } from "playwright";
import { resolveUniqueLocator } from "../locators/locator-resolver.js";
import type { ActionOutcome, JsonValue } from "../types/result.js";
import type { AssertVisibleTestStep } from "../types/scenario.js";
import {
  AssertionFailedError,
  LocatorResolutionError
} from "../utils/errors.js";

export async function executeAssertVisibleAction(
  page: Page,
  step: AssertVisibleTestStep,
  timeout: number
): Promise<ActionOutcome> {
  let locator;
  try {
    locator = await resolveUniqueLocator(page, step.target);
  } catch (error: unknown) {
    if (error instanceof LocatorResolutionError) {
      throw new AssertionFailedError(
        error.message,
        {
          visible: true,
          target: step.target.value
        },
        locatorFailureActual(error)
      );
    }
    throw error;
  }

  try {
    await locator.waitFor({ state: "visible", timeout });
  } catch (error: unknown) {
    if (error instanceof playwrightErrors.TimeoutError) {
      throw new AssertionFailedError(
        "대상 요소가 제한 시간 안에 표시되지 않았습니다.",
        {
          visible: true,
          target: step.target.value
        },
        {
          visible: false,
          target: step.target.value
        }
      );
    }
    throw error;
  }

  if (!(await locator.isVisible())) {
    throw new AssertionFailedError(
      "대상 요소가 화면에 표시되지 않습니다.",
      {
        visible: true,
        target: step.target.value
      },
      {
        visible: false,
        target: step.target.value
      }
    );
  }

  const text = (await locator.innerText({ timeout })).trim();
  return {
    expected: {
      visible: true,
      target: step.target.value
    },
    actual: {
      visible: true,
      text
    }
  };
}

function locatorFailureActual(error: LocatorResolutionError): JsonValue {
  return {
    visible: false,
    strategy: error.details.strategy,
    value: error.details.value,
    count: error.details.count
  };
}
