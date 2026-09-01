import type { BrowserContext, Locator, Page } from "playwright";
import type { BrowserAuthentication } from "../../shared/types/authentication";
import { AppError } from "../../shared/errors";
import { validateTargetUrl } from "../security/url-validator";

const USERNAME_SELECTOR = [
  'input[autocomplete="username"]', 'input[type="email"]', 'input[name*="email" i]',
  'input[name*="user" i]', 'input[name*="login" i]', 'input[type="text"]'
].join(",");
const PASSWORD_SELECTOR = 'input[type="password"]';

export async function authenticateContext(context: BrowserContext, authentication: BrowserAuthentication, targetUrl: string, timeoutMs: number): Promise<void> {
  await Promise.all([validateTargetUrl(authentication.loginUrl), validateTargetUrl(targetUrl)]);
  if (new URL(authentication.loginUrl).origin !== new URL(targetUrl).origin) {
    throw new AppError("AUTH_LOGIN_FAILED", "보안을 위해 로그인 주소와 테스트 URL은 같은 사이트여야 합니다.");
  }

  const page = await context.newPage();
  try {
    await page.goto(authentication.loginUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (new URL(page.url()).origin !== new URL(authentication.loginUrl).origin) {
      throw new AppError("AUTH_LOGIN_FAILED", "로그인 페이지가 다른 사이트로 이동했습니다. 소셜 로그인은 지원하지 않습니다.");
    }
    const username = await firstVisible(page.locator(USERNAME_SELECTOR));
    const password = await firstVisible(page.locator(PASSWORD_SELECTOR));
    if (!username || !password) throw new AppError("AUTH_LOGIN_FAILED", "아이디 또는 비밀번호 입력란을 찾지 못했습니다.");

    await username.fill(authentication.username, { timeout: Math.min(timeoutMs, 5000) });
    await password.fill(authentication.password, { timeout: Math.min(timeoutMs, 5000) });
    const namedSubmit = page.getByRole("button", { name: /로그인|sign\s*in|log\s*in/i });
    const submit = await firstVisible(namedSubmit) || await firstVisible(page.locator('button[type="submit"],input[type="submit"]'));
    if (submit) await submit.click({ timeout: Math.min(timeoutMs, 5000) });
    else await password.press("Enter", { timeout: Math.min(timeoutMs, 5000) });
    await page.waitForLoadState("domcontentloaded", { timeout: Math.min(timeoutMs, 5000) }).catch(() => undefined);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (await isLoginPage(page, authentication.loginUrl)) throw new AppError("AUTH_LOGIN_FAILED");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("AUTH_LOGIN_FAILED", undefined, 400, error instanceof Error ? error.name : "Login automation failed");
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function assertAuthenticationActive(page: Page, loginUrl: string): Promise<void> {
  if (await isLoginPage(page, loginUrl)) throw new AppError("AUTH_SESSION_EXPIRED");
}

async function firstVisible(locator: Locator): Promise<Locator | undefined> {
  const count = Math.min(await locator.count(), 20);
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return undefined;
}

async function isLoginPage(page: Page, loginUrl: string): Promise<boolean> {
  const current = new URL(page.url());
  const login = new URL(loginUrl);
  if (current.origin !== login.origin || normalizePath(current.pathname) !== normalizePath(login.pathname)) return false;
  return Boolean(await firstVisible(page.locator(PASSWORD_SELECTOR)));
}

function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}
