import { errors as playwrightErrors, type Page } from "playwright";
import { resolveUniqueLocator } from "../locators/locator-resolver.js";
import type { ActionOutcome } from "../types/result.js";
import type { ClickTestStep } from "../types/scenario.js";

export async function executeClickAction(
  page: Page,
  step: ClickTestStep,
  timeout: number
): Promise<ActionOutcome> {
  const locator = await resolveUniqueLocator(page, step.target);
  await locator.waitFor({ state: "visible", timeout });

  if (!(await locator.isVisible())) {
    throw new Error("클릭 대상 요소가 화면에 표시되지 않습니다.");
  }
  if (!(await locator.isEnabled())) {
    throw new Error("클릭 대상 요소가 비활성화되어 있습니다.");
  }

  await locator.click({ timeout });
  try {
    await page.waitForLoadState("domcontentloaded", { timeout });
  } catch (error: unknown) {
    if (!(error instanceof playwrightErrors.TimeoutError)) {
      throw error;
    }
  }

  return {
    expected: {
      clicked: true
    },
    actual: {
      clicked: true,
      currentUrl: page.url()
    }
  };
}
