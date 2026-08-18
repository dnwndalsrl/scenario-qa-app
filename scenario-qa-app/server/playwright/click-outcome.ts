import type { Page } from "playwright";
import type { DiscoveredElement, GeneratedTestStep } from "../../shared/types/analysis";
import { AppError } from "../../shared/errors";

export type ClickOutcomeExpectation =
  | { kind: "none" }
  | { kind: "url"; expectedUrl: string }
  | { kind: "scroll"; targetId?: string };

export function inferClickOutcome(step: GeneratedTestStep, element: DiscoveredElement | undefined, pageUrl: string): ClickOutcomeExpectation {
  const explicit = step.expected?.trim();
  if (explicit === "scroll") return { kind: "scroll" };
  if (explicit?.startsWith("scroll:")) return { kind: "scroll", targetId: normalizeTargetId(explicit.slice(7)) };
  if (explicit?.startsWith("url:")) return { kind: "url", expectedUrl: new URL(explicit.slice(4), pageUrl).href };

  const href = element?.href;
  if (!href || /^(?:javascript|mailto|tel):/i.test(href)) return { kind: "none" };
  const destination = new URL(href, pageUrl);
  const current = new URL(pageUrl);
  if (!sameDocument(destination, current)) return { kind: "url", expectedUrl: destination.href };
  if (destination.hash) return { kind: "scroll", targetId: normalizeTargetId(destination.hash) };
  return { kind: "none" };
}

export function urlMatchesExpected(actualUrl: string, expectedUrl: string): boolean {
  const actual = new URL(actualUrl);
  const expected = new URL(expectedUrl);
  return actual.origin === expected.origin
    && normalizedPath(actual.pathname) === normalizedPath(expected.pathname)
    && actual.search === expected.search
    && (!expected.hash || actual.hash === expected.hash);
}

export async function verifyClickOutcome(page: Page, expectation: ClickOutcomeExpectation, startedScrollY: number, timeout: number): Promise<void> {
  if (expectation.kind === "none") return;
  if (expectation.kind === "url") {
    try {
      await page.waitForURL((url) => urlMatchesExpected(url.href, expectation.expectedUrl), { timeout });
      return;
    } catch {
      throw new AppError("TEST_CLICK_OUTCOME_MISMATCH", `클릭 후 예상 URL로 이동하지 않았습니다. 예상: ${expectation.expectedUrl}, 실제: ${page.url()}`);
    }
  }

  try {
    await page.waitForFunction(({ initialY, targetId }) => {
      const moved = Math.abs(window.scrollY - initialY) >= 8;
      if (!targetId) return moved;
      const target = document.getElementById(targetId) || document.getElementsByName(targetId).item(0);
      if (!target) return false;
      const rect = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight
        && style.display !== "none" && style.visibility !== "hidden";
    }, { initialY: startedScrollY, targetId: expectation.targetId }, { timeout });
  } catch {
    const target = expectation.targetId ? ` 대상: #${expectation.targetId}` : "";
    throw new AppError("TEST_CLICK_OUTCOME_MISMATCH", `클릭 후 대상 섹션이 화면에 표시되지 않았습니다.${target}`);
  }
}

function sameDocument(left: URL, right: URL): boolean {
  return left.origin === right.origin && normalizedPath(left.pathname) === normalizedPath(right.pathname) && left.search === right.search;
}

function normalizedPath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

function normalizeTargetId(value: string): string | undefined {
  const target = value.trim().replace(/^#/, "");
  if (!target) return undefined;
  try { return decodeURIComponent(target); }
  catch { return target; }
}
