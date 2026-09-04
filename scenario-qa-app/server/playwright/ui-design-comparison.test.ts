import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compareUiDesign } from "./ui-design-comparison";

let browser: Awaited<ReturnType<typeof chromium.launch>>;

async function screenshot(color: string, width: number, height: number) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:${color}}</style>`);
  const bytes = Buffer.from(await page.screenshot({ type: "png" }));
  await page.close();
  return bytes;
}

beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser.close(); });

describe("UI design comparison", () => {
  it("treats identical captures as matched", async () => {
    const bytes = await screenshot("#ffffff", 120, 80);
    const page = await browser.newPage();
    const result = await compareUiDesign(page, {
      referenceBytes: bytes,
      referenceContentType: "image/png",
      referenceWidth: 120,
      referenceHeight: 80,
      actualBytes: bytes,
      actualWidth: 120,
      actualHeight: 80
    });
    expect(result.summary).toMatchObject({ status: "matched", differencePercent: 0, dimensionMismatch: false });
    expect(result.diffBytes.length).toBeGreaterThan(0);
    await page.close();
  });

  it("highlights a material visual change", async () => {
    const referenceBytes = await screenshot("#ffffff", 120, 80);
    const actualBytes = await screenshot("#111111", 120, 80);
    const page = await browser.newPage();
    const result = await compareUiDesign(page, {
      referenceBytes,
      referenceContentType: "image/png",
      referenceWidth: 120,
      referenceHeight: 80,
      actualBytes,
      actualWidth: 120,
      actualHeight: 80
    });
    expect(result.summary.status).toBe("different");
    expect(result.summary.differencePercent).toBeGreaterThan(90);
    await page.close();
  });

  it("requires review when image dimensions differ", async () => {
    const referenceBytes = await screenshot("#111111", 80, 80);
    const actualBytes = await screenshot("#111111", 120, 80);
    const page = await browser.newPage();
    const result = await compareUiDesign(page, {
      referenceBytes,
      referenceContentType: "image/png",
      referenceWidth: 80,
      referenceHeight: 80,
      actualBytes,
      actualWidth: 120,
      actualHeight: 80
    });
    expect(result.summary).toMatchObject({ status: "review", dimensionMismatch: true });
    await page.close();
  });
});
