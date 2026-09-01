import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { AutomatedStepResult, AutomatedTestRun, CapturedConsoleMessage, CapturedNetworkIssue, GeneratedTestAction, GeneratedTestScenario, GeneratedTestStep, LocatorCandidate, PageSnapshot, TestFailureKind } from "../../shared/types/analysis";
import type { BrowserAuthentication } from "../../shared/types/authentication";
import { AppError } from "../../shared/errors";
import { getAnalysisConfig } from "../config";
import { assertRedirectAllowed } from "../security/url-validator";
import { sanitizeText, sanitizeUrl } from "../security/sensitive-data";
import { savePngArtifact } from "../storage/artifact-store";
import { createId } from "../utils/id";
import { inferClickOutcome, urlMatchesExpected, verifyClickOutcome } from "./click-outcome";
import { resolveLocator } from "./locator-resolver";
import { assertAuthenticationActive, authenticateContext } from "./form-authentication";

interface StepExecution { locatorUsed?: LocatorCandidate; actual?: string; }
interface InteractionState { visible: boolean; text?: string; value?: string; checked?: boolean; attributes: Record<string, string>; }
interface VisualState { screenshot?: Buffer; url: string; scrollY: number; }
interface VisualBaseline { step: GeneratedTestStep; state: VisualState; }
const visualEvidenceActions = new Set<GeneratedTestAction>(["scroll_to_ratio", "scroll_by", "scroll_into_view", "click", "fill", "select", "press", "check", "uncheck"]);

export async function executeGeneratedTests(snapshot: PageSnapshot, scenarios: GeneratedTestScenario[], options: { authentication?: BrowserAuthentication } = {}): Promise<AutomatedTestRun[]> {
  const results: AutomatedTestRun[] = [];
  let browser: Browser | undefined;
  try {
    const executable = scenarios.some((scenario) => isExecutable(scenario, snapshot));
    if (executable) browser = await chromium.launch({ headless: true });
    for (const scenario of scenarios) {
      if (!isExecutable(scenario, snapshot)) { results.push(blockedRun(snapshot.analysisId, scenario)); continue; }
      results.push(await executeScenario(browser!, snapshot, scenario, options.authentication));
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
    if (!step.elementId) return false;
    const element = snapshot.elements.find((item) => item.id === step.elementId);
    if (step.action === "assert_value" && element?.inputType === "password") return true;
    if (step.action !== "click") return false;
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

async function executeScenario(browser: Browser, snapshot: PageSnapshot, scenario: GeneratedTestScenario, authentication?: BrowserAuthentication): Promise<AutomatedTestRun> {
  const config = getAnalysisConfig(); const started = Date.now();
  const context = await browser.newContext({ viewport: snapshot.viewport, serviceWorkers: "block" });
  if (authentication) {
    try { await authenticateContext(context, authentication, snapshot.finalUrl, config.testStepTimeoutMs); }
    catch (error) { await context.close().catch(() => undefined); return authenticationFailedRun(snapshot, scenario, error, started); }
  }
  const page = await context.newPage(); const consoleIssues: CapturedConsoleMessage[] = []; const networkIssues: CapturedNetworkIssue[] = []; const screenshotArtifactIds: string[] = [];
  captureIssues(page, consoleIssues, networkIssues);
  await guardNavigation(context, page);
  const run: AutomatedTestRun = { id: createId("run"), analysisId: snapshot.analysisId, pageId: snapshot.pageId, scenarioId: scenario.id, status: "running", stepResults: [], consoleIssues, networkIssues, screenshotArtifactIds, startedAt: new Date(started).toISOString() };
  let previousFailed = false;
  let lastInteraction: VisualBaseline | undefined;
  try {
    if (scenario.steps[0]?.action !== "goto") {
      await page.goto(snapshot.finalUrl, { waitUntil: "domcontentloaded", timeout: config.testStepTimeoutMs });
      if (authentication) await assertAuthenticationActive(page, authentication.loginUrl);
    }
    for (const step of scenario.steps) {
      if (previousFailed) { run.stepResults.push(baseStep(step, "blocked", "선행 단계 실패로 실행하지 않음")); continue; }
      const stepStarted = Date.now();
      const stepStartVisual = shouldCaptureVisualBefore(step) ? await captureVisualState(page, true).catch(() => undefined) : undefined;
      try {
        const execution = await executeStep(page, snapshot, step, config.testStepTimeoutMs);
        if (authentication) await assertAuthenticationActive(page, authentication.loginUrl);
        run.stepResults.push({ ...baseStep(step, "success"), expected: expectedValue(step), actual: execution.actual ?? await actualValue(page, snapshot, step, execution.locatorUsed), locatorUsed: execution.locatorUsed, currentUrl: sanitizeUrl(page.url()), startedAt: new Date(stepStarted).toISOString(), completedAt: new Date().toISOString(), durationMs: Date.now() - stepStarted });
        if (visualEvidenceActions.has(step.action) && stepStartVisual) lastInteraction = { step, state: stepStartVisual };
        if (step.action === "goto") lastInteraction = undefined;
      } catch (error) {
        previousFailed = true;
        const failureKind = classifyFailure(step, error);
        const afterVisual = await captureVisualState(page, true).catch(() => undefined);
        const baseline: VisualBaseline | undefined = visualEvidenceActions.has(step.action) && stepStartVisual
          ? { step, state: stepStartVisual }
          : lastInteraction ?? (stepStartVisual ? { step, state: stepStartVisual } : undefined);
        const beforeScreenshot = baseline?.state.screenshot ? await savePngArtifact(snapshot.analysisId, baseline.state.screenshot).catch(() => undefined) : undefined;
        const screenshot = afterVisual?.screenshot ? await savePngArtifact(snapshot.analysisId, afterVisual.screenshot).catch(() => undefined) : undefined;
        if (beforeScreenshot) screenshotArtifactIds.push(beforeScreenshot.id);
        if (screenshot) screenshotArtifactIds.push(screenshot.id);
        const visualChange = baseline && afterVisual ? {
          sourceStepOrder: baseline.step.order, sourceAction: baseline.step.action, sourceDescription: baseline.step.description,
          beforeUrl: baseline.state.url, afterUrl: afterVisual.url, beforeScrollY: baseline.state.scrollY, afterScrollY: afterVisual.scrollY
        } : undefined;
        const status = failureKind === "product_defect" ? "failed" : "error";
        run.stepResults.push({ ...baseStep(step, status, error instanceof Error ? error.message : String(error)), expected: expectedValue(step), actual: await actualValue(page, snapshot, step).catch(() => undefined), failureKind, currentUrl: sanitizeUrl(page.url()), beforeScreenshotArtifactId: beforeScreenshot?.id, screenshotArtifactId: screenshot?.id, visualChange, startedAt: new Date(stepStarted).toISOString(), completedAt: new Date().toISOString(), durationMs: Date.now() - stepStarted });
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

function authenticationFailedRun(snapshot: PageSnapshot, scenario: GeneratedTestScenario, error: unknown, started: number): AutomatedTestRun {
  const appError = error instanceof AppError ? error : new AppError("AUTH_LOGIN_FAILED");
  const completedAt = new Date().toISOString();
  return {
    id: createId("run"), analysisId: snapshot.analysisId, pageId: scenario.pageId, scenarioId: scenario.id,
    status: "error", failureKind: "environment_error", consoleIssues: [], networkIssues: [], screenshotArtifactIds: [],
    startedAt: new Date(started).toISOString(), completedAt, durationMs: Date.now() - started,
    error: { code: appError.code, message: appError.message },
    stepResults: scenario.steps.map((step) => ({ ...baseStep(step, "error", appError.message), failureKind: "environment_error" }))
  };
}

function shouldCaptureVisualBefore(step: GeneratedTestStep): boolean {
  return visualEvidenceActions.has(step.action) || isAssertion(step);
}

async function captureVisualState(page: Page, includeScreenshot = false): Promise<VisualState> {
  const position = await page.evaluate(() => ({ url: window.location.href, scrollY: Math.round(window.scrollY) }));
  const screenshot = includeScreenshot ? await page.screenshot({ type: "png", fullPage: false }).catch(() => undefined) : undefined;
  return { screenshot, url: sanitizeUrl(position.url), scrollY: position.scrollY };
}

async function executeStep(page: Page, snapshot: PageSnapshot, step: GeneratedTestStep, defaultTimeout: number): Promise<StepExecution> {
  const timeout = step.timeoutMs ?? defaultTimeout;
  if (step.action === "goto") { await page.goto(snapshot.finalUrl, { waitUntil: "domcontentloaded", timeout }); return {}; }
  if (step.action === "scroll_to_ratio") {
    const ratio = stepNumber(step, "스크롤 비율", 0, 100);
    await resetScrollTracking(page);
    await page.evaluate((value) => window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight) * value / 100), ratio);
    await waitForPageScrollStable(page, timeout);
    return {};
  }
  if (step.action === "scroll_by") {
    const pixels = stepNumber(step, "스크롤 이동 픽셀", -10000, 10000);
    await resetScrollTracking(page);
    await page.evaluate((value) => window.scrollBy(0, value), pixels);
    await waitForPageScrollStable(page, timeout);
    return {};
  }
  if (step.action === "assert_url") { assertExpectedUrl(page.url(), step.expected || snapshot.finalUrl); return {}; }
  if (step.action === "assert_title") { const title = await page.title(); if (step.expected ? !title.includes(step.expected) : !title.trim()) throw new Error(`페이지 제목이 예상과 다릅니다: ${title}`); return {}; }
  if (step.action === "assert_scroll") { await assertScrollOutcome(page, step.expected, timeout); return {}; }
  if (step.action === "assert_count") {
    const { locator, candidate } = await resolveCountStepLocator(page, snapshot, step);
    await waitForExpectedCount(locator, expectedCount(step), timeout);
    return { locatorUsed: candidate };
  }
  if (step.action === "wait_for_stable") {
    const resolved = step.elementId || step.locator
      ? await resolveStepLocator(page, snapshot, step, Math.min(timeout, 1500)).catch((error) => {
        if (error instanceof AppError && ["TEST_LOCATOR_NOT_FOUND", "TEST_LOCATOR_NOT_UNIQUE"].includes(error.code)) return undefined;
        throw error;
      })
      : undefined;
    if (resolved) await waitForElementStable(page, resolved.locator, step.value, timeout);
    else await waitForPageContentStable(page, step.value, timeout);
    return { locatorUsed: resolved?.candidate };
  }
  const { locator, candidate } = await resolveStepLocator(page, snapshot, step, timeout);
  switch (step.action) {
    case "scroll_into_view": await scrollLocatorIntoView(page, locator, timeout); break;
    case "assert_visible": await locator.waitFor({ state: "visible", timeout }); break;
    case "assert_hidden": await locator.waitFor({ state: "hidden", timeout }); break;
    case "assert_in_viewport": await locator.waitFor({ state: "visible", timeout }); await waitForInViewport(page, locator, timeout); break;
    case "assert_enabled": if (!await locator.isEnabled({ timeout })) throw new Error("요소가 비활성 상태입니다."); break;
    case "assert_text": { const text = await locator.innerText({ timeout }); if (!text.includes(step.expected || "")) throw new Error(`예상 텍스트를 찾지 못했습니다: ${text}`); break; }
    case "assert_attribute": { const actual = await locator.getAttribute(requiredAttribute(step)); if (actual !== step.expected) throw new Error(`속성값이 예상과 다릅니다. 예상: ${step.expected}, 실제: ${actual ?? "없음"}`); break; }
    case "assert_value": { const actual = await locator.inputValue({ timeout }); if (actual !== step.expected) throw new Error(`입력값이 예상과 다릅니다. 예상: ${step.expected}, 실제: ${actual}`); break; }
    case "click": {
      await resetScrollTracking(page);
      const startedUrl = page.url();
      const startedScrollY = await page.evaluate(() => window.scrollY);
      const expectation = inferClickOutcome(step, step.elementId ? snapshot.elements.find((element) => element.id === step.elementId) : undefined, page.url());
      const actionable = await resolveActionableLocator(locator);
      const before = await readInteractionState(actionable);
      await clickWhenActionable(page, actionable, timeout);
      await verifyClickOutcome(page, expectation, startedScrollY, timeout);
      if (expectation.kind === "url" || expectation.kind === "none" && page.url() !== startedUrl) return { locatorUsed: candidate, actual: `클릭 완료 · 페이지 이동: ${sanitizeUrl(page.url())}` };
      const after = await readInteractionState(actionable).catch(() => undefined);
      return { locatorUsed: candidate, actual: after ? describeStateTransition(before, after) : "클릭 완료 · 클릭 후 대상 제거 또는 페이지 이동" };
    }
    case "fill": await locator.fill(step.value || "qa-read-only-check", { timeout }); break;
    case "select": await locator.selectOption(step.value || { index: 0 }, { timeout }); break;
    case "press": await locator.press(step.value || "Tab", { timeout }); break;
    case "check": await locator.check({ timeout }); break;
    case "uncheck": await locator.uncheck({ timeout }); break;
    default: throw new AppError("TEST_EXECUTION_FAILED", `지원하지 않는 동작입니다: ${step.action}`);
  }
  return { locatorUsed: candidate };
}

async function actualValue(page: Page, snapshot: PageSnapshot, step: GeneratedTestStep, locatorUsed?: LocatorCandidate): Promise<string | undefined> {
  if (step.action === "assert_title") return sanitizeText(await page.title(), 500);
  if (step.action === "assert_url" || step.action === "goto") return sanitizeUrl(page.url());
  if (step.action === "assert_scroll") {
    const state = await page.evaluate(() => ({ scrollY: Math.round(window.scrollY), events: (window as any).__probeQaScroll?.eventCount || 0 }));
    return `스크롤 위치 ${state.scrollY}px · 스크롤 이벤트 ${state.events}회`;
  }
  if (step.action === "scroll_to_ratio" || step.action === "scroll_by") {
    const state = await page.evaluate(() => ({ scrollY: Math.round(window.scrollY), maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight), events: (window as any).__probeQaScroll?.eventCount || 0 }));
    const ratio = state.maxScroll ? Math.round(state.scrollY / state.maxScroll * 100) : 0;
    return `스크롤 위치 ${state.scrollY}px (${ratio}%) · 스크롤 이벤트 ${state.events}회`;
  }
  if (step.action === "wait_for_stable") {
    if (!locatorUsed) return "페이지 콘텐츠 안정화 확인";
    return readStableActualValue(page, locatorUsed);
  }
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
  if (["assert_visible", "assert_hidden", "assert_enabled"].includes(step.action)) return step.action === "assert_enabled" ? "활성 상태 확인" : step.action === "assert_hidden" ? "숨김 상태 확인" : "표시 상태 확인";
  if (step.action === "assert_text" && locatorUsed) return sanitizeText(await resolveLocator(page, locatorUsed).innerText().catch(() => ""), 500);
  if (step.action === "assert_attribute") return (await stateLocator(page, snapshot, step, locatorUsed).getAttribute(requiredAttribute(step))) ?? "없음";
  if (step.action === "assert_value") return sanitizeText(await stateLocator(page, snapshot, step, locatorUsed).inputValue(), 500);
  if (step.action === "assert_count") return String(await stateLocator(page, snapshot, step, locatorUsed).count());
  if (step.action === "click") return "클릭 완료 · 상태 변화 미감지";
  return undefined;
}

function assertExpectedUrl(actualUrl: string, expectedValue: string): void {
  const expected = expectedValue.trim();
  if (expected.startsWith("url-prefix:")) {
    if (!urlMatchesExpected(actualUrl, new URL(expected.slice(11), actualUrl).href, true)) throw new Error(`예상 URL과 다릅니다. 예상: ${expected.slice(11)}, 실제: ${actualUrl}`);
    return;
  }
  if (expected.startsWith("url:")) {
    if (!urlMatchesExpected(actualUrl, new URL(expected.slice(4), actualUrl).href)) throw new Error(`예상 URL과 다릅니다. 예상: ${expected.slice(4)}, 실제: ${actualUrl}`);
    return;
  }
  if (!actualUrl.includes(expected)) throw new Error(`예상 URL과 다릅니다. 예상: ${expected}, 실제: ${actualUrl}`);
}

async function assertScrollOutcome(page: Page, expected: string | undefined, timeout: number): Promise<void> {
  const targetId = expected?.trim().replace(/^#/, "");
  try {
    await page.waitForFunction((id) => {
      const tracking = (window as any).__probeQaScroll;
      if (!id || id === "changed") return Boolean(tracking?.eventCount > 0 && Math.abs(tracking.lastY - tracking.startedY) >= 8);
      const target = document.getElementById(id) || document.getElementsByName(id).item(0);
      if (!target) return false;
      const rect = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight
        && style.display !== "none" && style.visibility !== "hidden";
    }, targetId || "changed", { timeout });
  } catch {
    throw new Error(targetId && targetId !== "changed" ? `예상 섹션 #${targetId}이 화면에 표시되지 않았습니다.` : "클릭 후 예상한 스크롤 이동이 발생하지 않았습니다.");
  }
}

export async function readStableActualValue(page: Page, locatorUsed: LocatorCandidate): Promise<string> {
  const text = await resolveLocator(page, locatorUsed).innerText().catch(() => undefined);
  return text === undefined
    ? "페이지 콘텐츠 안정화 확인"
    : `안정화된 값: ${sanitizeText(text, 500)}`;
}
function baseStep(step: GeneratedTestStep, status: AutomatedStepResult["status"], errorMessage?: string): AutomatedStepResult { return { stepId: step.id, order: step.order, action: step.action, description: step.description, status, errorMessage }; }
function isAssertion(step: GeneratedTestStep) { return step.action.startsWith("assert_"); }
function expectedValue(step: GeneratedTestStep): string | undefined {
  if (step.expected) return step.expected;
  if (step.action === "assert_visible") return "대상 요소가 표시됨";
  if (step.action === "assert_hidden") return "대상 요소가 숨겨짐";
  if (step.action === "assert_in_viewport") return "대상 요소가 화면 영역 안에 표시됨";
  if (step.action === "assert_enabled") return "대상 요소가 활성 상태임";
  if (step.action === "assert_title") return "페이지 제목이 존재함";
  return undefined;
}

function requiredAttribute(step: GeneratedTestStep): string {
  const name = step.value?.trim();
  if (!name || !/^[a-zA-Z_:][a-zA-Z0-9:._-]*$/.test(name)) throw new AppError("TEST_EXECUTION_FAILED", "검증할 속성명이 올바르지 않습니다.");
  if (step.expected === undefined) throw new AppError("TEST_EXECUTION_FAILED", "속성 예상값이 없습니다.");
  return name;
}

function expectedCount(step: GeneratedTestStep): number {
  const count = Number(step.expected);
  if (!step.expected?.trim() || !Number.isInteger(count) || count < 0) throw new AppError("TEST_EXECUTION_FAILED", "예상 개수는 0 이상의 정수여야 합니다.");
  return count;
}

function stateLocator(page: Page, snapshot: PageSnapshot, step: GeneratedTestStep, locatorUsed?: LocatorCandidate) {
  const candidate = locatorUsed ?? step.locator ?? (step.elementId ? snapshot.elements.find((element) => element.id === step.elementId)?.locatorCandidates[0] : undefined);
  if (!candidate) throw new AppError("TEST_LOCATOR_NOT_FOUND");
  return resolveLocator(page, candidate);
}

function stepNumber(step: GeneratedTestStep, label: string, min: number, max: number): number {
  const value = Number(step.value);
  if (!step.value?.trim() || !Number.isFinite(value) || value < min || value > max) throw new AppError("TEST_EXECUTION_FAILED", `${label}은(는) ${min}~${max} 사이 숫자여야 합니다.`);
  return value;
}

async function resolveCountStepLocator(page: Page, snapshot: PageSnapshot, step: GeneratedTestStep) {
  const element = step.elementId ? snapshot.elements.find((item) => item.id === step.elementId) : undefined;
  const candidates = [step.locator, ...(element?.locatorCandidates || [])]
    .filter((item): item is LocatorCandidate => Boolean(item))
    .filter((item, index, values) => values.findIndex((value) => value.strategy === item.strategy && value.value === item.value) === index);
  if (!candidates.length) throw new AppError("TEST_LOCATOR_NOT_FOUND");
  for (const candidate of candidates) {
    const locator = resolveLocator(page, candidate);
    if (await locator.count().catch(() => 0)) return { locator, candidate };
  }
  return { locator: resolveLocator(page, candidates[0]!), candidate: candidates[0]! };
}

async function waitForExpectedCount(locator: import("playwright").Locator, expected: number, timeout: number): Promise<void> {
  const started = Date.now();
  let actual = await locator.count();
  while (actual !== expected && Date.now() - started < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 75));
    actual = await locator.count();
  }
  if (actual !== expected) throw new Error(`요소 개수가 예상과 다릅니다. 예상: ${expected}, 실제: ${actual}`);
}

async function readInteractionState(locator: import("playwright").Locator): Promise<InteractionState> {
  return locator.evaluate((element) => {
    const node = element as HTMLElement;
    const input = element as HTMLInputElement;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const attributes = Object.fromEntries(["aria-expanded", "aria-selected", "aria-pressed", "aria-checked", "data-state"]
      .map((name) => [name, node.getAttribute(name)] as const).filter((entry): entry is readonly [string, string] => entry[1] !== null));
    return {
      visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0,
      text: (node.innerText || "").replace(/\s+/g, " ").trim().slice(0, 200) || undefined,
      value: "value" in input && input.type !== "password" ? String(input.value).slice(0, 200) : undefined,
      checked: "checked" in input ? Boolean(input.checked) : undefined,
      attributes
    };
  });
}

function describeStateTransition(before: InteractionState, after: InteractionState): string {
  const changes: string[] = [];
  const names = new Set([...Object.keys(before.attributes), ...Object.keys(after.attributes)]);
  for (const name of names) if (before.attributes[name] !== after.attributes[name]) changes.push(`${name}=${before.attributes[name] ?? "없음"} → ${name}=${after.attributes[name] ?? "없음"}`);
  if (before.visible !== after.visible) changes.push(`표시=${before.visible} → 표시=${after.visible}`);
  if (before.value !== after.value) changes.push(`값=${before.value ?? "없음"} → 값=${after.value ?? "없음"}`);
  if (before.checked !== after.checked) changes.push(`체크=${before.checked ?? "없음"} → 체크=${after.checked ?? "없음"}`);
  if (before.text !== after.text) changes.push(`텍스트=${before.text ?? "없음"} → 텍스트=${after.text ?? "없음"}`);
  return changes.length ? `클릭 전후 상태: ${changes.join(" · ")}` : "클릭 완료 · 상태 변화 미감지";
}

async function resolveStepLocator(page: Page, snapshot: PageSnapshot, step: GeneratedTestStep, timeout: number) {
  const element = step.elementId ? snapshot.elements.find((item) => item.id === step.elementId) : undefined;
  const stepLocator = !element || element.locatorCandidates.some((item) => item.strategy === step.locator?.strategy && item.value === step.locator.value) ? step.locator : undefined;
  const candidates = [stepLocator, ...(element?.locatorCandidates || [])]
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
        if (count > 1) {
          const visibleIndexes: number[] = [];
          for (let index = 0; index < count; index += 1) {
            if (await locator.nth(index).isVisible().catch(() => false)) visibleIndexes.push(index);
          }
          if (visibleIndexes.length === 1) return { locator: locator.nth(visibleIndexes[0]!), candidate };
          if (step.action === "click" && visibleIndexes.length > 1) {
            const signatures = await Promise.all(visibleIndexes.map((index) => actionableSignature(locator.nth(index))));
            if (signatures.every(Boolean) && new Set(signatures).size === 1) return { locator: locator.nth(visibleIndexes[0]!), candidate };
          }
          if (visibleIndexes.length > 1) ambiguous = true;
        }
      } catch { /* 다음 후보를 확인합니다. */ }
    }
    await page.waitForTimeout(75);
  }
  if (ambiguous) throw new AppError("TEST_LOCATOR_NOT_UNIQUE");
  throw new AppError("TEST_LOCATOR_NOT_FOUND", "저장된 locator 후보로 테스트 대상 요소를 찾지 못했습니다.");
}

async function actionableSignature(locator: import("playwright").Locator): Promise<string | undefined> {
  return locator.evaluate((element) => {
    const direct = element.closest("a[href],button,[role='link'],[role='button']");
    let target = direct;
    let parent = element.parentElement;
    for (let depth = 0; !target && parent && depth < 3; depth += 1, parent = parent.parentElement) {
      const controls = parent.querySelectorAll(":scope > a[href],:scope > button,:scope > [role='link'],:scope > [role='button']");
      if (controls.length === 1) target = controls.item(0);
    }
    if (!target) return undefined;
    const href = target instanceof HTMLAnchorElement ? new URL(target.href, location.href).href : "";
    return `${target.tagName.toLowerCase()}:${href}:${target.getAttribute("role") || ""}:${target.getAttribute("type") || ""}`;
  }).catch(() => undefined);
}

async function resolveActionableLocator(locator: import("playwright").Locator): Promise<import("playwright").Locator> {
  const direct = locator.locator("xpath=ancestor-or-self::*[self::a or self::button or @role='link' or @role='button'][1]");
  if (await direct.count() === 1) return direct;
  let parent = locator.locator("xpath=..");
  for (let depth = 0; depth < 3; depth += 1) {
    const controls = parent.locator(":scope > a[href],:scope > button,:scope > [role='link'],:scope > [role='button']");
    if (await controls.count() === 1) return controls.first();
    parent = parent.locator("xpath=..");
  }
  return locator;
}

function classifyFailure(step: GeneratedTestStep, error: unknown): TestFailureKind {
  if (error instanceof AppError) {
    if (error.code === "TEST_SAFETY_BLOCKED") return "safety_blocked";
    if (["TEST_LOCATOR_NOT_FOUND", "TEST_LOCATOR_NOT_UNIQUE", "TEST_DYNAMIC_HEADER_HIDDEN", "TEST_TARGET_NOT_ACTIONABLE"].includes(error.code)) return "automation_limit";
    if (error.code === "TEST_CLICK_OUTCOME_MISMATCH") return "product_defect";
    if (["TEST_EXECUTION_FAILED", "TEST_EXECUTION_TIMEOUT", "AUTH_LOGIN_FAILED", "AUTH_SESSION_EXPIRED"].includes(error.code)) return "environment_error";
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

async function waitForPageScrollStable(page: Page, timeout: number): Promise<void> {
  const started = Date.now();
  let previous = "";
  let stableSamples = 0;
  while (Date.now() - started < timeout) {
    const current = await page.evaluate(() => `${Math.round(window.scrollY)}:${document.documentElement.scrollHeight}`);
    stableSamples = current === previous ? stableSamples + 1 : 0;
    if (stableSamples >= 2) return;
    previous = current;
    await page.waitForTimeout(75);
  }
  throw new AppError("TEST_EXECUTION_TIMEOUT", "스크롤 위치가 제한 시간 안에 안정되지 않았습니다.");
}

async function waitForElementStable(page: Page, locator: import("playwright").Locator, value: string | undefined, timeout: number): Promise<void> {
  const stableMs = value?.trim() ? Number(value) : 300;
  if (!Number.isFinite(stableMs) || stableMs < 100 || stableMs > 5000) throw new AppError("TEST_EXECUTION_FAILED", "안정 유지 시간은 100~5000ms 사이 숫자여야 합니다.");
  await locator.waitFor({ state: "visible", timeout });
  const started = Date.now();
  let previous = "";
  let stableSince = Date.now();
  while (Date.now() - started < timeout) {
    const current = await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return JSON.stringify({ text: element.textContent?.trim(), top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    if (current !== previous) { previous = current; stableSince = Date.now(); }
    else if (Date.now() - stableSince >= stableMs) return;
    await page.waitForTimeout(75);
  }
  throw new AppError("TEST_EXECUTION_TIMEOUT", "대상 요소의 값과 위치가 제한 시간 안에 안정되지 않았습니다.");
}

async function waitForPageContentStable(page: Page, value: string | undefined, timeout: number): Promise<void> {
  const stableMs = value?.trim() ? Number(value) : 300;
  if (!Number.isFinite(stableMs) || stableMs < 100 || stableMs > 5000) throw new AppError("TEST_EXECUTION_FAILED", "안정 유지 시간은 100~5000ms 사이 숫자여야 합니다.");
  const started = Date.now();
  let previous = "";
  let stableSince = Date.now();
  while (Date.now() - started < timeout) {
    const current = await page.evaluate(() => JSON.stringify({
      text: document.body?.innerText.slice(0, 20000) || "",
      height: document.documentElement.scrollHeight,
      elements: document.getElementsByTagName("*").length
    }));
    if (current !== previous) { previous = current; stableSince = Date.now(); }
    else if (Date.now() - stableSince >= stableMs) return;
    await page.waitForTimeout(75);
  }
  throw new AppError("TEST_EXECUTION_TIMEOUT", "페이지 콘텐츠가 제한 시간 안에 안정되지 않았습니다.");
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

async function clickWhenActionable(page: Page, locator: import("playwright").Locator, timeout: number): Promise<void> {
  const started = Date.now();
  const scroll = await page.evaluate(() => ({
    current: window.scrollY,
    maximum: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    width: window.innerWidth,
    height: window.innerHeight
  }));
  const positions = [scroll.current, scroll.maximum * 0.25, scroll.maximum * 0.5, 0]
    .map((value) => Math.round(value))
    .filter((value, index, values) => values.indexOf(value) === index);
  let lastError: unknown;

  for (const position of positions) {
    const remaining = timeout - (Date.now() - started);
    if (remaining <= 0) break;
    await page.mouse.move(Math.max(0, scroll.width - 2), Math.max(0, scroll.height - 2));
    await page.evaluate((value) => window.scrollTo(0, value), position);
    await waitForPageScrollStable(page, Math.min(500, remaining)).catch(() => undefined);
    try {
      await revealDynamicHeader(page, locator, Math.min(800, Math.max(1, timeout - (Date.now() - started))));
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "TEST_DYNAMIC_HEADER_HIDDEN") throw error;
      lastError = error;
      continue;
    }

    try {
      const actionTimeout = Math.min(1800, Math.max(1, timeout - (Date.now() - started)));
      await locator.click({ trial: true, timeout: Math.min(600, actionTimeout) });
      await locator.click({ timeout: actionTimeout });
      return;
    } catch (error) {
      lastError = error;
      if (await clickExactDomTarget(page, locator)) return;
    }
  }

  throw new AppError("TEST_TARGET_NOT_ACTIONABLE", undefined, 400, lastError instanceof Error ? lastError.message : String(lastError || "click target remained blocked"));
}

async function clickExactDomTarget(page: Page, locator: import("playwright").Locator): Promise<boolean> {
  const clicked = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    if (style.pointerEvents === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || element.getAttribute("aria-disabled") === "true") return undefined;
    if (element instanceof HTMLButtonElement && element.disabled) return undefined;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) return undefined;
    if (!(element instanceof HTMLElement)) return undefined;
    element.click();
    return true;
  }).catch(() => undefined);
  if (!clicked) return false;
  await page.waitForTimeout(100);
  return true;
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
