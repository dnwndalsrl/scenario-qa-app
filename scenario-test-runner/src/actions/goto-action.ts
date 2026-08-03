import type { Page } from "playwright";
import type { ActionOutcome } from "../types/result.js";
import type { GotoTestStep } from "../types/scenario.js";

export async function executeGotoAction(
  page: Page,
  step: GotoTestStep,
  baseUrl: string,
  timeout: number
): Promise<ActionOutcome> {
  const targetUrl = resolveHttpUrl(step.value, baseUrl);
  const response = await page.goto(targetUrl, {
    waitUntil: "load",
    timeout
  });
  const finalUrl = page.url();
  assertHttpProtocol(finalUrl);

  return {
    expected: {
      requestedUrl: targetUrl
    },
    actual: {
      finalUrl,
      httpStatus: response?.status() ?? null
    }
  };
}

function resolveHttpUrl(value: string, baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value, baseUrl);
  } catch {
    throw new Error(`유효하지 않은 URL입니다: ${value}`);
  }
  assertHttpProtocol(parsed.toString());
  return parsed.toString();
}

function assertHttpProtocol(value: string): void {
  const protocol = new URL(value).protocol;
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(`HTTP 또는 HTTPS URL만 허용됩니다: ${value}`);
  }
}
