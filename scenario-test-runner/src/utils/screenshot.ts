import path from "node:path";
import { rm, stat } from "node:fs/promises";
import type { Page } from "playwright";
import {
  ensureDirectory,
  safeFileSegment,
  timestampForFile,
  toPortableRelativePath
} from "./file.js";

let screenshotsCapturedInActiveRun = 0;

export function resetScreenshotBudget(): void {
  screenshotsCapturedInActiveRun = 0;
}

export async function captureFailureScreenshot(
  page: Page,
  projectRoot: string,
  screenshotsDirectory: string,
  scenarioId: string,
  stepId: string,
  capturedAt: Date,
  sensitiveValues: readonly string[] = []
): Promise<string> {
  const maximumScreenshots = positiveInteger(process.env.MAX_SCREENSHOTS_PER_RUN, 5);
  if (screenshotsCapturedInActiveRun >= maximumScreenshots) {
    throw new Error(`스크린샷 저장 한도(${maximumScreenshots}개)를 초과했습니다.`);
  }
  screenshotsCapturedInActiveRun += 1;
  await ensureDirectory(screenshotsDirectory);
  const filename = [
    safeFileSegment(scenarioId),
    safeFileSegment(stepId),
    timestampForFile(capturedAt)
  ].join("__");
  const absolutePath = path.join(screenshotsDirectory, `${filename}.png`);

  const marker = "data-qa-sensitive-screenshot";
  await page
    .locator("input, textarea, select, [contenteditable='true']")
    .evaluateAll(
      (elements, values) => {
        const sensitive = new Set(values as string[]);
        for (const element of elements) {
          const value =
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement
              ? element.value
              : element.textContent ?? "";
          if (sensitive.has(value)) element.setAttribute("data-qa-sensitive-screenshot", "true");
        }
      },
      [...sensitiveValues]
    )
    .catch(() => undefined);
  try {
    await page.screenshot({
      path: absolutePath,
      fullPage: true,
      animations: "disabled",
      mask: [page.locator(`[${marker}="true"]`)],
      maskColor: "#1f2937"
    });
  } finally {
    await page.locator(`[${marker}]`).evaluateAll((elements) => {
      for (const element of elements) element.removeAttribute("data-qa-sensitive-screenshot");
    }).catch(() => undefined);
  }
  const maxBytes = positiveNumber(process.env.MAX_SCREENSHOT_SIZE_MB, 10) * 1024 * 1024;
  const size = (await stat(absolutePath)).size;
  if (size > maxBytes) {
    await rm(absolutePath, { force: true });
    throw new Error(`스크린샷 크기가 제한(${Math.round(maxBytes / 1024 / 1024)}MB)을 초과했습니다.`);
  }

  return toPortableRelativePath(projectRoot, absolutePath);
}

function positiveNumber(value: string | undefined, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
function positiveInteger(value: string | undefined, fallback: number): number { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
