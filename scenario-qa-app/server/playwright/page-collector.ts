import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { CapturedConsoleMessage, CapturedNetworkIssue, DiscoveredElement, DiscoveredElementType, PageObservationState, PageSnapshot, PageStateObservation } from "../../shared/types/analysis";
import { AppError } from "../../shared/errors";
import { getAnalysisConfig } from "../config";
import { sanitizeText, sanitizeUrl } from "../security/sensitive-data";
import { assertRedirectAllowed, validateTargetUrl } from "../security/url-validator";
import { savePngArtifact } from "../storage/artifact-store";
import { createId } from "../utils/id";
import { buildLocatorCandidates } from "./locator-builder";
import { markLocatorUniqueness } from "./locator-resolver";

interface RawElement {
  tagName: string; role?: string; accessibleName?: string; label?: string; text?: string; placeholder?: string; testId?: string;
  href?: string; inputType?: string; enabled?: boolean; required?: boolean; readonly?: boolean; id?: string; classes?: string[];
  headingLevel?: number; formKey?: string; method?: string; action?: string; alt?: string; noFollow?: boolean; download?: boolean;
  region?: "header" | "main" | "footer" | "other";
  domPath?: string; inViewport?: boolean; actionable?: boolean; stateAttributes?: Record<string, string>;
}
interface ObservedRawElement extends RawElement { observedStates: PageObservationState[]; inViewportStates: PageObservationState[]; }

const RISK_WORDS = /삭제|탈퇴|결제|주문|구매|환불|승인|발송|전송|제출|등록|수정|저장|비밀번호\s*변경|권한\s*변경|delete|remove|purchase|payment|checkout|refund|submit|save|update|send/i;

export async function collectPage(analysisId: string, requestedUrl: string, viewport: { width: number; height: number }, timeoutMs: number, onStage?: (stage: "loading_page" | "collecting_page") => Promise<void>): Promise<PageSnapshot> {
  const session = await PageCollectionSession.create(viewport);
  try { return await session.collect(analysisId, requestedUrl, timeoutMs, { onStage }); }
  finally { await session.close(); }
}

export class PageCollectionSession {
  private constructor(private readonly browser: Browser, private readonly context: BrowserContext) {}
  static async create(viewport: { width: number; height: number }): Promise<PageCollectionSession> {
    let browser: Browser;
    try { browser = await chromium.launch({ headless: true }); }
    catch (error) { throw new AppError("ANALYSIS_BROWSER_START_FAILED", undefined, 500, error instanceof Error ? error.message : String(error)); }
    const context = await browser.newContext({ viewport, ignoreHTTPSErrors: false, serviceWorkers: "block" });
    return new PageCollectionSession(browser, context);
  }
  collect(analysisId: string, requestedUrl: string, timeoutMs: number, options: { pageId?: string; allowedOrigin?: string; onStage?: (stage: "loading_page" | "collecting_page") => Promise<void> } = {}) {
    return collectPageInContext(this.context, analysisId, requestedUrl, timeoutMs, options);
  }
  async close() { await this.context.close().catch(() => undefined); await this.browser.close().catch(() => undefined); }
}

async function collectPageInContext(context: BrowserContext, analysisId: string, requestedUrl: string, timeoutMs: number, options: { pageId?: string; allowedOrigin?: string; onStage?: (stage: "loading_page" | "collecting_page") => Promise<void> }): Promise<PageSnapshot> {
  const config = getAnalysisConfig();
  let browser: Browser | undefined;
  const page = await context.newPage();
  const consoleMessages: CapturedConsoleMessage[] = [];
  const networkIssues: CapturedNetworkIssue[] = [];
  let redirectFailure: AppError | undefined; let mainStatus: number | undefined; let mainContentType: string | undefined;

  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    consoleMessages.push({ id: createId("console"), type: message.type() as "error" | "warning", text: sanitizeText(message.text(), 1000), recordedAt: new Date().toISOString() });
  });
  page.on("pageerror", (error) => consoleMessages.push({ id: createId("console"), type: "pageerror", text: sanitizeText(error.message, 1000), recordedAt: new Date().toISOString() }));
  page.on("requestfailed", (request) => networkIssues.push({ id: createId("network"), url: sanitizeUrl(request.url()), method: request.method(), resourceType: request.resourceType(), failureText: sanitizeText(request.failure()?.errorText || "요청 실패"), recordedAt: new Date().toISOString() }));
  page.on("response", (response) => {
    if (response.request().isNavigationRequest() && response.request().frame() === page.mainFrame()) { mainStatus = response.status(); mainContentType = response.headers()["content-type"]; }
    if (response.status() < 400 || !["document", "xhr", "fetch"].includes(response.request().resourceType())) return;
    networkIssues.push({ id: createId("network"), url: sanitizeUrl(response.url()), method: response.request().method(), resourceType: response.request().resourceType(), status: response.status(), recordedAt: new Date().toISOString() });
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      try {
        await assertRedirectAllowed(request.url());
        if (options.allowedOrigin && new URL(request.url()).origin !== options.allowedOrigin) throw new AppError("CRAWL_REDIRECT_BLOCKED");
      }
      catch (error) { redirectFailure = error instanceof AppError ? error : new AppError("ANALYSIS_REDIRECT_BLOCKED"); await route.abort("blockedbyclient"); return; }
    }
    await route.continue();
  });

  try {
    await validateTargetUrl(requestedUrl);
    await options.onStage?.("loading_page");
    try { await page.goto(requestedUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }); }
    catch (error: any) {
      if (redirectFailure) throw redirectFailure;
      if (error?.name === "TimeoutError") throw new AppError("ANALYSIS_PAGE_TIMEOUT", undefined, 408, error.message);
      throw new AppError("ANALYSIS_PAGE_LOAD_FAILED", undefined, 502, error instanceof Error ? error.message : String(error));
    }
    const finalUrl = page.url();
    await assertRedirectAllowed(finalUrl);
    await options.onStage?.("collecting_page");

    const metadata = await page.evaluate(() => ({
      title: document.title || "",
      description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || "",
      language: document.documentElement.lang || "",
      canonicalUrl: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || ""
    }));
    const observed = await collectPageStates(page, config.maxDiscoveredElements, config.maxTotalVisibleTextLength);
    const rawElements = observed.elements;
    const elements: DiscoveredElement[] = [];
    for (let index = 0; index < rawElements.length; index += 1) {
      const raw = rawElements[index]!;
      const candidates = await markLocatorUniqueness(page, buildLocatorCandidates(raw));
      const riskSource = [raw.text, raw.accessibleName, raw.href, raw.action].filter(Boolean).join(" ");
      elements.push({
        id: `element-${index + 1}`, type: elementType(raw), tagName: raw.tagName, role: raw.role, accessibleName: raw.accessibleName,
        label: raw.label, text: raw.text, placeholder: raw.placeholder, testId: raw.testId, href: raw.href ? sanitizeUrl(raw.href) : undefined,
        inputType: raw.inputType, visible: true, enabled: raw.enabled, required: raw.required, readonly: raw.readonly, actionable: raw.actionable,
        locatorCandidates: candidates, safetyHints: RISK_WORDS.test(riskSource) ? ["상태 변경 가능성이 있는 문구가 발견됨"] : [], stateAttributes: raw.stateAttributes,
        observedStates: raw.observedStates, inViewportStates: raw.inViewportStates
      });
    }
    const headings = rawElements.map((raw, index) => raw.headingLevel ? { level: raw.headingLevel, text: raw.text || raw.accessibleName || "", elementId: `element-${index + 1}` } : undefined).filter((value): value is NonNullable<typeof value> => Boolean(value));
    const forms = rawElements.map((raw, index) => raw.tagName === "form" ? {
      elementId: `element-${index + 1}`, method: (raw.method || "get").toLowerCase(), action: raw.action ? sanitizeUrl(raw.action) : undefined,
      fieldElementIds: rawElements.map((field, fieldIndex) => field.formKey === raw.formKey && field.tagName !== "form" ? `element-${fieldIndex + 1}` : undefined).filter((value): value is string => Boolean(value))
    } : undefined).filter((value): value is NonNullable<typeof value> => Boolean(value));
    const requestedOrigin = new URL(finalUrl).origin;
    const internalLinks = rawElements.map((raw, index) => raw.tagName === "a" && raw.href ? { elementId: `element-${index + 1}`, href: sanitizeUrl(raw.href), text: raw.text, accessibleName: raw.accessibleName, internal: new URL(raw.href, finalUrl).origin === requestedOrigin, noFollow: raw.noFollow, download: raw.download, region: raw.region, visible: true } : undefined).filter((value): value is NonNullable<typeof value> => Boolean(value)).slice(0, config.maxInternalLinks);
    let screenshotArtifactId: string | undefined;
    if (config.screenshotEnabled) {
      const screenshot = await page.screenshot({ fullPage: true, type: "png" });
      screenshotArtifactId = (await savePngArtifact(analysisId, screenshot)).id;
    }
    return {
      id: createId("snapshot"), analysisId, pageId: options.pageId, requestedUrl: sanitizeUrl(requestedUrl), finalUrl: sanitizeUrl(finalUrl), canonicalUrl: metadata.canonicalUrl ? sanitizeUrl(metadata.canonicalUrl) : undefined, title: sanitizeText(metadata.title, 500),
      description: sanitizeText(metadata.description, 500), language: sanitizeText(metadata.language, 30), httpStatus: mainStatus, contentType: mainContentType, viewport: page.viewportSize() || { width: 1440, height: 900 }, headings, elements, forms, internalLinks,
      consoleMessages: consoleMessages.slice(0, 100), networkIssues: deduplicateNetwork(networkIssues).slice(0, 100), stateObservations: observed.states, screenshotArtifactId, collectedAt: new Date().toISOString()
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("ANALYSIS_PAGE_COLLECTION_FAILED", undefined, 500, error instanceof Error ? error.message : String(error));
  } finally { await page.close().catch(() => undefined); }
}

async function collectPageStates(page: Page, maxElements: number, maxTotalText: number): Promise<{ elements: ObservedRawElement[]; states: PageStateObservation[] }> {
  const plan: Array<{ state: PageObservationState; ratio: number }> = [
    { state: "initial", ratio: 0 }, { state: "scroll_25", ratio: .25 }, { state: "scroll_50", ratio: .5 },
    { state: "scroll_75", ratio: .75 }, { state: "scroll_100", ratio: 1 }, { state: "scroll_up", ratio: .5 }, { state: "restored_top", ratio: 0 }
  ];
  const merged = new Map<string, ObservedRawElement>();
  const states: PageStateObservation[] = [];
  for (const step of plan) {
    const targetY = await page.evaluate((ratio) => Math.round(Math.max(0, document.documentElement.scrollHeight - innerHeight) * ratio), step.ratio);
    await page.evaluate((scrollY) => scrollTo(0, scrollY), targetY);
    await page.waitForTimeout(step.state === "initial" ? 180 : 140);
    const rows = await collectRawElements(page, maxElements, maxTotalText);
    const metrics = await page.evaluate(() => ({ scrollY: Math.round(window.scrollY), documentHeight: document.documentElement.scrollHeight }));
    states.push({ state: step.state, ...metrics, inViewportElementCount: rows.filter((row) => row.inViewport).length });
    for (const raw of rows) {
      const key = raw.domPath || `${raw.tagName}:${raw.testId || raw.id || raw.accessibleName || raw.text || "unknown"}`;
      const existing = merged.get(key);
      if (existing) {
        if (!existing.observedStates.includes(step.state)) existing.observedStates.push(step.state);
        if (raw.inViewport && !existing.inViewportStates.includes(step.state)) existing.inViewportStates.push(step.state);
        if (raw.actionable) existing.actionable = true;
      } else if (merged.size < maxElements) {
        merged.set(key, { ...raw, observedStates: [step.state], inViewportStates: raw.inViewport ? [step.state] : [] });
      }
    }
  }
  return { elements: [...merged.values()], states };
}

async function collectRawElements(page: Page, maxElements: number, maxTotalText: number): Promise<RawElement[]> {
  const rows = await page.evaluate(({ maxElements, maxTotalText }) => {
    const selector = "a,button,input,textarea,select,form,h1,h2,h3,h4,h5,h6,nav,main,header,footer,aside,table,[role=dialog],[role=tab],[role=alert],img";
    const all = [...document.querySelectorAll<HTMLElement>(selector)];
    const forms = [...document.querySelectorAll<HTMLFormElement>("form")];
    let totalText = 0;
    // Object methods avoid tsx/esbuild's injected `__name` helper. That
    // helper is unavailable inside Playwright's isolated page context.
    const helpers = {
      visible(node: HTMLElement) {
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        let current: HTMLElement | null = node;
        while (current) {
          const style = getComputedStyle(current);
          if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) return false;
          current = current.parentElement;
        }
        return true;
      },
      actionable(node: HTMLElement) {
        if (!node.matches("a[href],button,input,textarea,select,[role='link'],[role='button'],[role='tab']")) return undefined;
        const rect = node.getBoundingClientRect();
        const left = Math.max(0, rect.left); const right = Math.min(innerWidth, rect.right);
        const top = Math.max(0, rect.top); const bottom = Math.min(innerHeight, rect.bottom);
        if (right <= left || bottom <= top || getComputedStyle(node).pointerEvents === "none") return false;
        const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        return Boolean(hit && (hit === node || node.contains(hit)));
      },
      clean(value: string | null | undefined, max = 300) {
        const normalized = (value || "").replace(/\s+/g, " ").trim();
        const remaining = Math.max(0, maxTotalText - totalText); const result = normalized.slice(0, Math.min(max, remaining)); totalText += result.length; return result || undefined;
      },
      path(node: HTMLElement) {
        if (node.dataset.testid) return `[data-testid="${node.dataset.testid}"]`;
        if (node.id) return `#${CSS.escape(node.id)}`;
        const parts: string[] = []; let current: HTMLElement | null = node;
        while (current && current !== document.body) {
          const parent: HTMLElement | null = current.parentElement; if (!parent) break;
          const siblings = [...parent.children].filter((item) => item.tagName === current!.tagName);
          parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`); current = parent;
        }
        return `body>${parts.join(">")}`;
      }
    };
    return all.filter((node) => helpers.visible(node)).slice(0, maxElements).map((node) => {
      const input = node as HTMLInputElement; const anchor = node as HTMLAnchorElement; const form = node as HTMLFormElement; const image = node as HTMLImageElement;
      const label = node.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(node.id)}"]`)?.innerText : node.closest("label")?.textContent;
      const role = node.getAttribute("role") || ({ A: "link", BUTTON: "button", NAV: "navigation", MAIN: "main", HEADER: "banner", FOOTER: "contentinfo", ASIDE: "complementary", TABLE: "table" } as Record<string,string>)[node.tagName];
      const text = node.tagName === "INPUT" && input.type === "password" ? undefined : helpers.clean(node.innerText || (node.tagName === "IMG" ? image.alt : ""));
      const linkedHeading = node.tagName === "A" && !text ? node.parentElement?.querySelector("h1,h2,h3,h4,h5,h6")?.textContent : undefined;
      const accessibleName = helpers.clean(node.getAttribute("aria-label") || label || text || node.getAttribute("title") || image.alt || linkedHeading, 300);
      const ownerForm = node.tagName === "FORM" ? node as HTMLFormElement : node.closest("form");
      const rect = node.getBoundingClientRect();
      const stateAttributes = Object.fromEntries(["aria-expanded", "aria-selected", "aria-pressed", "aria-checked", "aria-controls", "data-state"]
        .map((name) => [name, node.getAttribute(name)] as const).filter((entry): entry is readonly [string, string] => entry[1] !== null));
      return {
        tagName: node.tagName.toLowerCase(), role: role || undefined, accessibleName, label: helpers.clean(label), text,
        placeholder: helpers.clean(input.placeholder), testId: node.dataset.testid, href: anchor.href || undefined,
        inputType: node.tagName === "INPUT" ? input.type : undefined, enabled: !(input.disabled || node.getAttribute("aria-disabled") === "true"),
        required: Boolean(input.required || node.getAttribute("aria-required") === "true"), readonly: Boolean(input.readOnly), id: node.id || undefined,
        classes: [...node.classList].slice(0, 5), headingLevel: /^H[1-6]$/.test(node.tagName) ? Number(node.tagName.slice(1)) : undefined,
        formKey: ownerForm ? `form-${forms.indexOf(ownerForm)}` : undefined, method: node.tagName === "FORM" ? form.method : undefined,
        action: node.tagName === "FORM" ? form.action : undefined, alt: node.tagName === "IMG" ? image.alt : undefined,
        noFollow: node.tagName === "A" ? (node.getAttribute("rel") || "").split(/\s+/).includes("nofollow") : undefined,
        download: node.tagName === "A" ? node.hasAttribute("download") : undefined,
        region: node.closest("header") ? "header" : node.closest("main") ? "main" : node.closest("footer") ? "footer" : "other",
        domPath: helpers.path(node), inViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
        actionable: helpers.actionable(node), stateAttributes: Object.keys(stateAttributes).length ? stateAttributes : undefined
      };
    });
  }, { maxElements, maxTotalText });
  return rows as RawElement[];
}

function elementType(raw: RawElement): DiscoveredElementType {
  if (raw.tagName === "a") return "link"; if (raw.tagName === "button") return "button"; if (raw.tagName === "textarea") return "textarea";
  if (raw.tagName === "select") return "select"; if (raw.tagName === "form") return "form"; if (/^h[1-6]$/.test(raw.tagName)) return "heading";
  if (raw.tagName === "nav") return "navigation"; if (raw.tagName === "table") return "table"; if (raw.tagName === "img") return "image";
  if (raw.role === "dialog") return "dialog"; if (raw.role === "tab") return "tab"; if (raw.role === "alert") return "alert";
  if (raw.tagName === "input") { if (raw.inputType === "checkbox") return "checkbox"; if (raw.inputType === "radio") return "radio"; return "input"; }
  return "other";
}

function deduplicateNetwork(items: CapturedNetworkIssue[]): CapturedNetworkIssue[] {
  const seen = new Set<string>(); return items.filter((item) => { const key = `${item.method}:${item.url}:${item.status ?? item.failureText}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
