import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { AutomatedStepResult, AutomatedTestRun, CapturedConsoleMessage, CapturedNetworkIssue, GeneratedTestScenario, GeneratedTestStep, LocatorCandidate, PageSnapshot, TestFailureKind } from "../../shared/types/analysis";
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
    id: createId("run"), analysisId, pageId: scenario.pageId, scenarioId: scenario.id, status: "blocked", failureKind: "safety_blocked", consoleIssues: [], networkIssues: [], screenshotArtifactIds: [], startedAt: now, completedAt: now, durationMs: 0,
    error: { code: "TEST_SAFETY_BLOCKED", message: "안전 정책에 따라 자동 실행하지 않았습니다." },
    stepResults: scenario.steps.map((step) => ({ stepId: step.id, order: step.order, action: step.action, description: step.description, status: "blocked", failureKind: "safety_blocked", errorMessage: "안전 정책에 따라 실행하지 않음" }))
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
    if (scenario.steps[0]?.action !== "goto") {
      await page.goto(snapshot.finalUrl, { waitUntil: "domcontentloaded", timeout: config.testStepTimeoutMs });
    }
    for (const step of scenario.steps) {
      if (previousFailed) { run.stepResults.push(baseStep(step, "blocked", "선행 단계 실패로 실행하지 않음")); continue; }
      const stepStarted = Date.now();
      try {
        const locatorUsed = await executeStep(page, snapshot, step, config.testStepTimeoutMs);
        run.stepResults.push({ ...baseStep(step, "success"), expected: step.expected, actual: await actualValue(page, snapshot, step, locatorUsed), locatorUsed, currentUrl: sanitizeUrl(page.url()), startedAt: new Date(stepStarted).toISOString(), completedAt: new Date().toISOString(), durationMs: Date.now() - stepStarted });
      } catch (error) {
        previousFailed = true;
        const failureKind = classifyFailure(step, error);
        const screenshot = await page.screenshot({ type: "png", fullPage: false }).then((bytes) => savePngArtifact(snapshot.analysisId, bytes)).catch(() => undefined);
        if (screenshot) screenshotArtifactIds.push(screenshot.id);
        const status = failureKind === "product_defect" ? "failed" : "error";
        run.stepResults.push({ ...baseStep(step, status, error instanceof Error ? error.message : String(error)), expected: step.expected, failureKind, currentUrl: sanitizeUrl(page.url()), screenshotArtifactId: screenshot?.id, startedAt: new Date(stepStarted).toISOString(), completedAt: new Date().toISOString(), durationMs: Date.now() - stepStarted });
      }
    }
    run.status = run.stepResults.some((step) => step.status === "error") ? "error" : run.stepResults.some((step) => step.status === "failed") ? "failed" : "success";
    run.failureKind = run.stepResults.find((step) => step.failureKind)?.failureKind;
    return run;
  } finally {
    run.completedAt = new Date().toISOString(); run.durationMs = Date.now() - started;
    await context.close().catch(() => undefined);
  }
}

async function executeStep(page: Page, snapshot: PageSnapshot, step: GeneratedTestStep, defaultTimeout: number): Promise<LocatorCandidate | undefined> {
  const timeout = step.timeoutMs ?? defaultTimeout;
  if (step.action === "goto") { await page.goto(snapshot.finalUrl, { waitUntil: "domcontentloaded", timeout }); return undefined; }
  if (step.action === "assert_url") { if (!page.url().includes(step.expected || snapshot.finalUrl)) throw new Error(`예상 URL과 다릅니다: ${page.url()}`); return undefined; }
  if (step.action === "assert_title") { const title = await page.title(); if (step.expected ? !title.includes(step.expected) : !title.trim()) throw new Error(`페이지 제목이 예상과 다릅니다: ${title}`); return undefined; }
  const { locator, candidate } = await resolveStepLocator(page, snapshot, step, timeout);
  switch (step.action) {
    case "scroll_into_view": await scrollLocatorIntoView(page, locator, timeout); break;
    case "assert_visible": await locator.waitFor({ state: "visible", timeout }); break;
    case "assert_in_viewport": await locator.waitFor({ state: "visible", timeout }); await waitForInViewport(page, locator, timeout); break;
    case "assert_enabled": if (!await locator.isEnabled({ timeout })) throw new Error("요소가 비활성 상태입니다."); break;
    case "assert_text": { const text = await locator.innerText({ timeout }); if (!text.includes(step.expected || "")) throw new Error(`예상 텍스트를 찾지 못했습니다: ${text}`); break; }
    case "click": {
      await resetScrollTracking(page);
      await revealDynamicHeader(page, locator, timeout);
      try { await locator.click({ timeout }); }
      catch (error) { throw new AppError("TEST_TARGET_NOT_ACTIONABLE", undefined, 400, error instanceof Error ? error.message : String(error)); }
      break;
    }
    case "fill": await locator.fill(step.value || "qa-read-only-check", { timeout }); break;
    case "select": await locator.selectOption(step.value || { index: 0 }, { timeout }); break;
    case "press": await locator.press(step.value || "Tab", { timeout }); break;
    case "check": await locator.check({ timeout }); break;
    case "uncheck": await locator.uncheck({ timeout }); break;
    default: throw new AppError("TEST_EXECUTION_FAILED", `지원하지 않는 동작입니다: ${step.action}`);
  }
  return candidate;
}

async function actualValue(page: Page, snapshot: PageSnapshot, step: GeneratedTestStep, locatorUsed?: LocatorCandidate): Promise<string | undefined> {
  if (step.action === "assert_title") return sanitizeText(await page.title(), 500);
  if (step.action === "assert_url" || step.action === "goto") return sanitizeUrl(page.url());
  if (step.action === "assert_in_viewport" || step.action === "scroll_into_view") {
    const candidate = locatorUsed ?? step.locator ?? (step.elementId ? snapshot.elements.find((element) => element.id === step.elementId)?.locatorCandidates.find((item) => item.unique) : undefined);
    if (!candidate) return undefined;
    const locator = resolveLocator(page, candidate);
    const rect = await locator.evaluate((element) => {
      const value = element.getBoundingClientRect();
      return { top: Math.round(value.top), bottom: Math.round(value.bottom), viewportHeight: window.innerHeight };
    });
    const scroll = await page.evaluate(() => (window as any).__probeQaScroll || { eventCount: 0, startedY: window.scrollY, lastY: window.scrollY, maxDelta: 0 });
    const prefix = step.action === "scroll_into_view" ? "대상으로 스크롤" : "화면 내 도달";
    return `${prefix}(top ${rect.top}px / ${rect.viewportHeight}px) · 스크롤 이벤트 ${scroll.eventCount}회 · 이동 ${Math.round(scroll.lastY - scroll.startedY)}px`;
  }
  return undefined;
}
function baseStep(step: GeneratedTestStep, status: AutomatedStepResult["status"], errorMessage?: string): AutomatedStepResult { return { stepId: step.id, order: step.order, action: step.action, description: step.description, status, errorMessage }; }
function isAssertion(step: GeneratedTestStep) { return step.action.startsWith("assert_"); }

async function resolveStepLocator(page: Page, snapshot: PageSnapshot, step: GeneratedTestStep, timeout: number) {
  const element = step.elementId ? snapshot.elements.find((item) => item.id === step.elementId) : undefined;
  const stepLocator = !element || element.locatorCandidates.some((item) => item.strategy === step.locator?.strategy && item.value === step.locator.value) ? step.locator : undefined;
  const candidates = [stepLocator, ...(element?.locatorCandidates.filter((item) => item.unique) || [])]
    .filter((item): item is LocatorCandidate => Boolean(item))
    .filter((item, index, values) => values.findIndex((value) => value.strategy === item.strategy && value.value === item.value) === index);
  if (!candidates.length) throw new AppError("TEST_LOCATOR_NOT_FOUND");

  const deadline = Date.now() + timeout;
  let ambiguous = false;
  while (Date.now() < deadline) {
    for (const candidate of candidates) {
      try {
        const locator = resolveLocator(page, candidate);
        const count = await locator.count();
        if (count === 1) return { locator, candidate };
        if (count > 1) ambiguous = true;
      } catch { /* 다음 후보를 확인합니다. */ }
    }
    await page.waitForTimeout(75);
  }
  if (ambiguous) throw new AppError("TEST_LOCATOR_NOT_UNIQUE");
  throw new AppError("TEST_LOCATOR_NOT_FOUND", "저장된 locator 후보로 테스트 대상 요소를 찾지 못했습니다.");
}

function classifyFailure(step: GeneratedTestStep, error: unknown): TestFailureKind {
  if (error instanceof AppError) {
    if (error.code === "TEST_SAFETY_BLOCKED") return "safety_blocked";
    if (["TEST_LOCATOR_NOT_FOUND", "TEST_LOCATOR_NOT_UNIQUE", "TEST_DYNAMIC_HEADER_HIDDEN", "TEST_TARGET_NOT_ACTIONABLE"].includes(error.code)) return "automation_limit";
    if (["TEST_EXECUTION_FAILED", "TEST_EXECUTION_TIMEOUT"].includes(error.code)) return "environment_error";
  }
  if (step.action === "goto") return "environment_error";
  return isAssertion(step) ? "product_defect" : "automation_limit";
}

async function resetScrollTracking(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as any;
    state.__probeQaScroll = { eventCount: 0, startedY: window.scrollY, lastY: window.scrollY, maxDelta: 0 };
    if (state.__probeQaScrollInstalled) return;
    state.__probeQaScrollInstalled = true;
    window.addEventListener("scroll", (event) => {
      const current = state.__probeQaScroll;
      if (!current) return;
      const target = event.target;
      const position = target instanceof HTMLElement ? target.scrollTop : window.scrollY;
      current.eventCount += 1;
      current.lastY = window.scrollY;
      current.maxDelta = Math.max(current.maxDelta, Math.abs(position), Math.abs(window.scrollY - current.startedY));
    }, true);
  });
}

async function scrollLocatorIntoView(page: Page, locator: import("playwright").Locator, timeout: number): Promise<void> {
  await resetScrollTracking(page);
  await locator.waitFor({ state: "visible", timeout });
  await locator.scrollIntoViewIfNeeded({ timeout });
  await page.waitForTimeout(100);
  await waitForInViewport(page, locator, timeout);
}

async function revealDynamicHeader(page: Page, locator: import("playwright").Locator, timeout: number): Promise<void> {
  const started = Date.now();
  let visibleSamples = 0;
  while (Date.now() - started < timeout) {
    const state = await locator.evaluate((element) => {
      const target = element.getBoundingClientRect();
      let ancestor: Element | null = element;
      let fixedAncestor = false;
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        if (style.position === "fixed" || style.position === "sticky") { fixedAncestor = true; break; }
        ancestor = ancestor.parentElement;
      }
      const inViewport = target.bottom > 0 && target.top < window.innerHeight && target.right > 0 && target.left < window.innerWidth;
      return { fixedAncestor, inViewport, scrollY: window.scrollY };
    });
    if (!state.fixedAncestor) return;
    if (state.inViewport) {
      visibleSamples += 1;
      if (visibleSamples >= 2) return;
      await page.waitForTimeout(100);
      continue;
    }
    visibleSamples = 0;
    if (state.scrollY <= 0) break;
    await page.mouse.wheel(0, -Math.min(240, state.scrollY));
    await page.waitForTimeout(100);
  }
  throw new AppError("TEST_DYNAMIC_HEADER_HIDDEN");
}

async function waitForInViewport(page: Page, locator: import("playwright").Locator, timeout: number): Promise<void> {
  await locator.waitFor({ state: "visible", timeout });
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const reached = await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const horizontal = rect.right > 0 && rect.left < window.innerWidth;
      const vertical = rect.bottom > 0 && rect.top < window.innerHeight;
      return horizontal && vertical;
    }).catch(() => false);
    if (reached) return;
    await page.waitForTimeout(50);
  }
  throw new Error("대상 요소가 제한 시간 안에 화면 영역으로 이동하지 않았습니다.");
}

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
