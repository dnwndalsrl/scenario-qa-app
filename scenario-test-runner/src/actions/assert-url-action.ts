import { errors as playwrightErrors, type Page } from "playwright";
import type { ActionOutcome } from "../types/result.js";
import type { AssertUrlTestStep } from "../types/scenario.js";
import { AssertionFailedError } from "../utils/errors.js";

export async function executeAssertUrlAction(
  page: Page,
  step: AssertUrlTestStep,
  timeout: number
): Promise<ActionOutcome> {
  const matches = (url: URL): boolean =>
    matchesExpectedUrl(url.toString(), step.expected.operator, step.expected.value);

  try {
    await page.waitForURL(matches, {
      timeout,
      waitUntil: "domcontentloaded"
    });
  } catch (error: unknown) {
    if (!(error instanceof playwrightErrors.TimeoutError)) {
      throw error;
    }
  }

  const actualUrl = page.url();
  if (
    !matchesExpectedUrl(
      actualUrl,
      step.expected.operator,
      step.expected.value
    )
  ) {
    throw new AssertionFailedError(
      "현재 URL이 예상 조건과 일치하지 않습니다.",
      {
        operator: step.expected.operator,
        value: step.expected.value
      },
      {
        currentUrl: actualUrl
      }
    );
  }

  return {
    expected: {
      operator: step.expected.operator,
      value: step.expected.value
    },
    actual: {
      currentUrl: actualUrl
    }
  };
}

function matchesExpectedUrl(
  actualUrl: string,
  operator: "exact" | "contains",
  expectedValue: string
): boolean {
  if (operator === "contains") {
    return actualUrl.includes(expectedValue);
  }

  if (/^https?:\/\//i.test(expectedValue)) {
    return actualUrl === expectedValue;
  }

  const actual = new URL(actualUrl);
  const relativeActual = `${actual.pathname}${actual.search}${actual.hash}`;
  return relativeActual === expectedValue;
}
