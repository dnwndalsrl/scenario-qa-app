import type { Page } from "playwright";
import { resolveUniqueLocator } from "../locators/locator-resolver.js";
import type { ActionOutcome } from "../types/result.js";
import type { FillTestStep } from "../types/scenario.js";

export async function executeFillAction(
  page: Page,
  step: FillTestStep,
  timeout: number
): Promise<ActionOutcome> {
  const locator = await resolveUniqueLocator(page, step.target);
  await locator.waitFor({ state: "visible", timeout });

  if (!(await locator.isVisible())) {
    throw new Error("입력 대상 요소가 화면에 표시되지 않습니다.");
  }
  if (!(await locator.isEnabled())) {
    throw new Error("입력 대상 요소가 비활성화되어 있습니다.");
  }

  await locator.fill("", { timeout });
  await locator.fill(step.value, { timeout });
  const inputValue = await locator.inputValue({ timeout });
  const isSensitive = step.sensitive === true;

  return {
    expected: {
      inputValue: isSensitive ? "[REDACTED]" : step.value
    },
    actual: {
      inputValue: isSensitive ? "[REDACTED]" : inputValue,
      masked: isSensitive
    }
  };
}
