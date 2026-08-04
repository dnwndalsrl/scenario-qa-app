import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { AutomatedStepResult, AutomatedTestRun, CapturedConsoleMessage, CapturedNetworkIssue, GeneratedTestScenario, GeneratedTestStep, PageSnapshot } from "../../shared/types/analysis";
import { AppError } from "../../shared/errors";
import { getAnalysisConfig } from "../config";
import { assertRedirectAllowed } from "../security/url-validator";
import { sanitizeText, sanitizeUrl } from "../security/sensitive-data";
import { savePngArtifact } from "../storage/artifact-store";
import { createId } from "../utils/id";
import { resolveLocator } from "./locator-resolver";

export async function executeGeneratedTests(snapshot: PageSnapshot, scenarios: GeneratedTestScenario[]): Promise<AutomatedTestRun[]> {
  const results: AutomatedTestRun[] = [];
  let browser: Browser | undefined;
  try {
    const executable = scenarios.some((scenario) => isExecutable(scenario, snapshot));
    if (executable) browser = await chromium.launch({ headless: true });
    for (const scenario of scenarios) {
      if (!isExecutable(scenario, snapshot)) { results.push(blockedRun(snapshot.analysisId, scenario)); continue; }
      results.push(await executeScenario(browser!, snapshot, scenario));
    }
    return results;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("TEST_EXECUTION_FAILED", undefined, 500, error instanceof Error ? error.message : String(error));
  } finally { await browser?.close().catch(() => undefined); }
}

function isExecutable(scenario: GeneratedTestScenario, snapshot: PageSnapshot): boolean {
  if (scenario.safetyLevel !== "safe" || !scenario.autoExecutable) return false;
  const origin = new URL(snapshot.finalUrl).origin;
  return !scenario.steps.some((step) => {
    if (step.action !== "click" || !step.elementId) return false;
    const element = snapshot.elements.find((item) => item.id === step.elementId);
    return Boolean(element?.safetyHints.length || element?.href && new URL(element.href, snapshot.finalUrl).origin !== origin);
  });
}

function blockedRun(analysisId: string, scenario: GeneratedTestScenario): AutomatedTestRun {
  const now = new Date().toISOString();
  return {
    id: createId("run"), analysisId, pageId: scenario.pageId, scenarioId: scenario.id, status: "blocked", consoleIssues: [], networkIssues: [], screenshotArtifactIds: [], startedAt: now, completedAt: now, durationMs: 0,
    error: { code: "TEST_SAFETY_BLOCKED", message: "안전 정책에 따라 자동 실행하지 않았습니다." },
    stepResults: scenario.steps.map((step) => ({ stepId: step.id, order: step.order, action: step.action, description: step.description, status: "blocked", errorMessage: "안전 정책에 따라 실행하지 않음" }))
  };
}

async function executeScenario(browser: Browser, snapshot: PageSnapshot, scenario: GeneratedTestScenario): Promise<AutomatedTestRun> {
  const config = getAnalysisConfig(); const started = Date.now();
  const context = await browser.newContext({ viewport: snapshot.viewport, serviceWorkers: "block" });
  const page = await context.newPage(); const consoleIssues: CapturedConsoleMessage[] = []; const networkIssues: CapturedNetworkIssue[] = []; const screenshotArtifactIds: string[] = [];
  captureIssues(page, consoleIssues, networkIssues);
  await guardNavigation(context, page);
  const run: AutomatedTestRun = { id: createId("run"), analysisId: snapshot.analysisId, pageId: snapshot.pageId, scenarioId: scenario.id, status: "running", stepResults: [], consoleIssues, networkIssues, screenshotArtifactIds, startedAt: new Date(started).toISOString() };
  let previousFailed = false;
  try {
    for (const step of scenario.steps) {
      if (previousFailed) { run.stepResults.push(baseStep(step, "blocked", "선행 단계 실패로 실행하지 않음")); continue; }
      const stepStarted = Date.now();
      try {
        await executeStep(page, snapshot, step, config.testStepTimeoutMs);
        run.stepResults.push({ ...baseStep(step, "success"), expected: step.expected, actual: await actualValue(page, step), currentUrl: sanitizeUrl(page.url()), startedAt: new Date(stepStarted).toISOString(), completedAt: new Date().toISOString(), durationMs: Date.now() - stepStarted });
      } catch (error) {
        previousFailed = true;
        const screenshot = await page.screenshot({ type: "png", fullPage: false }).then((bytes) => savePngArtifact(snapshot.analysisId, bytes)).catch(() => undefined);
        if (screenshot) screenshotArtifactIds.push(screenshot.id);
        run.stepResults.push({ ...baseStep(step, isAssertion(step) ? "failed" : "error", error instanceof Error ? error.message : String(error)), expected: step.expected, currentUrl: sanitizeUrl(page.url()), screenshotArtifactId: screenshot?.id, startedAt: new Date(stepStarted).toISOString(), completedAt: new Date().toISOString(), durationMs: Date.now() - stepStarted });
      }
    }
    run.status = run.stepResults.some((step) => step.status === "error") ? "error" : run.stepResults.some((step) => step.status === "failed") ? "failed" : "success";
    return run;
  } finally {
    run.completedAt = new Date().toISOString(); run.durationMs = Date.now() - started;
    await context.close().catch(() => undefined);
  }
}

async function executeStep(page: Page, snapshot: PageSnapshot, step: GeneratedTestStep, defaultTimeout: number): Promise<void> {
  const timeout = step.timeoutMs ?? defaultTimeout;
  if (step.action === "goto") { await page.goto(snapshot.finalUrl, { waitUntil: "domcontentloaded", timeout }); return; }
  if (step.action === "assert_url") { if (!page.url().includes(step.expected || snapshot.finalUrl)) throw new Error(`예상 URL과 다릅니다: ${page.url()}`); return; }
  if (step.action === "assert_title") { const title = await page.title(); if (step.expected ? !title.includes(step.expected) : !title.trim()) throw new Error(`페이지 제목이 예상과 다릅니다: ${title}`); return; }
  const candidate = step.locator ?? (step.elementId ? snapshot.elements.find((element) => element.id === step.elementId)?.locatorCandidates.find((item) => item.unique) : undefined);
  if (!candidate) throw new AppError("TEST_LOCATOR_NOT_FOUND");
  const locator = resolveLocator(page, candidate); const count = await locator.count();
  if (count === 0) throw new AppError("TEST_LOCATOR_NOT_FOUND"); if (count !== 1) throw new AppError("TEST_LOCATOR_NOT_UNIQUE");
  switch (step.action) {
    case "assert_visible": await locator.waitFor({ state: "visible", timeout }); break;
    case "assert_enabled": if (!await locator.isEnabled({ timeout })) throw new Error("요소가 비활성 상태입니다."); break;
    case "assert_text": { const text = await locator.innerText({ timeout }); if (!text.includes(step.expected || "")) throw new Error(`예상 텍스트를 찾지 못했습니다: ${text}`); break; }
    case "click": await locator.click({ timeout }); break;
    case "fill": await locator.fill(step.value || "qa-read-only-check", { timeout }); break;
    case "select": await locator.selectOption(step.value || { index: 0 }, { timeout }); break;
    case "press": await locator.press(step.value || "Tab", { timeout }); break;
    case "check": await locator.check({ timeout }); break;
    case "uncheck": await locator.uncheck({ timeout }); break;
    default: throw new AppError("TEST_EXECUTION_FAILED", `지원하지 않는 동작입니다: ${step.action}`);
  }
}

async function actualValue(page: Page, step: GeneratedTestStep): Promise<string | undefined> {
  if (step.action === "assert_title") return sanitizeText(await page.title(), 500); if (step.action === "assert_url" || step.action === "goto") return sanitizeUrl(page.url()); return undefined;
}
function baseStep(step: GeneratedTestStep, status: AutomatedStepResult["status"], errorMessage?: string): AutomatedStepResult { return { stepId: step.id, order: step.order, action: step.action, description: step.description, status, errorMessage }; }
function isAssertion(step: GeneratedTestStep) { return step.action.startsWith("assert_"); }

function captureIssues(page: Page, consoleIssues: CapturedConsoleMessage[], networkIssues: CapturedNetworkIssue[]) {
  page.on("console", (message) => { if (["error", "warning"].includes(message.type())) consoleIssues.push({ id: createId("console"), type: message.type() as "error" | "warning", text: sanitizeText(message.text(), 1000), recordedAt: new Date().toISOString() }); });
  page.on("pageerror", (error) => consoleIssues.push({ id: createId("console"), type: "pageerror", text: sanitizeText(error.message, 1000), recordedAt: new Date().toISOString() }));
  page.on("requestfailed", (request) => networkIssues.push({ id: createId("network"), url: sanitizeUrl(request.url()), method: request.method(), resourceType: request.resourceType(), failureText: sanitizeText(request.failure()?.errorText || "요청 실패"), recordedAt: new Date().toISOString() }));
  page.on("response", (response) => { if (response.status() >= 400 && ["document", "xhr", "fetch"].includes(response.request().resourceType())) networkIssues.push({ id: createId("network"), url: sanitizeUrl(response.url()), method: response.request().method(), resourceType: response.request().resourceType(), status: response.status(), recordedAt: new Date().toISOString() }); });
}
async function guardNavigation(context: BrowserContext, page: Page) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) { try { await assertRedirectAllowed(request.url()); } catch { await route.abort("blockedbyclient"); return; } }
    await route.continue();
  });
}
