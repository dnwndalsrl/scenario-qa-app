import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";
import type { H3Event } from "h3";
import {
  deleteCookie,
  getCookie,
  getHeader,
  getRequestIP,
  setCookie
} from "h3";

const COOKIE_NAME = "scenario_qa_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

interface SessionPayload {
  username: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

export function authEnabled(): boolean {
  return process.env.APP_AUTH_ENABLED === "true";
}

export function requireAuthConfiguration(): void {
  if (!authEnabled()) return;
  if ((process.env.APP_AUTH_USERNAME ?? "").trim().length < 3) {
    throw new Error("APP_AUTH_USERNAME must contain at least 3 characters.");
  }
  if (!/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/.test(process.env.APP_AUTH_PASSWORD_HASH ?? "")) {
    throw new Error("APP_AUTH_PASSWORD_HASH must be a valid generated scrypt hash.");
  }
  if ((process.env.APP_SESSION_SECRET ?? "").length < 32) {
    throw new Error("APP_SESSION_SECRET must contain at least 32 characters.");
  }
}

export function verifyPassword(password: string, encodedHash: string): boolean {
  try {
    const [algorithm, nText, rText, pText, saltText, expectedText] = encodedHash.split("$");
    if (algorithm !== "scrypt" || !nText || !rText || !pText || !saltText || !expectedText) return false;
    const expected = Buffer.from(expectedText, "base64url");
    const actual = scryptSync(password, Buffer.from(saltText, "base64url"), expected.length, {
      N: Number(nText),
      r: Number(rText),
      p: Number(pText),
      maxmem: 64 * 1024 * 1024
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createPasswordHash(password: string): string {
  const N = 16_384;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function createSessionToken(username: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const payload: SessionPayload = {
    username,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + SESSION_TTL_SECONDS,
    nonce: randomBytes(16).toString("base64url")
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function readSessionToken(token: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): SessionPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = Buffer.from(sign(encoded, secret), "base64url");
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof parsed.username !== "string" || typeof parsed.issuedAt !== "number" || typeof parsed.expiresAt !== "number" || typeof parsed.nonce !== "string") return null;
    if (parsed.expiresAt <= nowSeconds || parsed.issuedAt > nowSeconds + 60) return null;
    return parsed as SessionPayload;
  } catch {
    return null;
  }
}

export function getSession(event: H3Event): SessionPayload | null {
  if (!authEnabled()) return { username: "auth-disabled", issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, nonce: "disabled" };
  return readSessionToken(getCookie(event, COOKIE_NAME), process.env.APP_SESSION_SECRET ?? "");
}

export function setSession(event: H3Event, username: string): void {
  setCookie(event, COOKIE_NAME, createSessionToken(username, process.env.APP_SESSION_SECRET ?? ""), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

export function clearSession(event: H3Event): void {
  deleteCookie(event, COOKIE_NAME, { path: "/" });
}

export function assertSameOrigin(event: H3Event): void {
  const configured = process.env.APP_BASE_URL ?? "";
  const origin = getHeader(event, "origin") ?? "";
  let expected = "";
  try { expected = new URL(configured).origin; } catch { /* startup validation reports this */ }
  if (origin !== expected) {
    throw createError({ statusCode: 403, statusMessage: "AUTH_ORIGIN_INVALID", message: "요청 출처를 확인할 수 없습니다." });
  }
}

export function loginRateLimitKey(event: H3Event, username: string): string {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  return createHash("sha256").update(`${ip}:${username.toLowerCase()}`).digest("hex").slice(0, 24);
}

export function assertLoginAllowed(key: string, now = Date.now()): void {
  const state = loginAttempts.get(key);
  if (!state || state.resetAt <= now) return;
  if (state.count >= 5) {
    throw createError({ statusCode: 429, statusMessage: "AUTH_RATE_LIMITED", message: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요." });
  }
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  const state = loginAttempts.get(key);
  if (!state || state.resetAt <= now) loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  else state.count += 1;
  if (loginAttempts.size > 1_000) {
    for (const [candidate, value] of loginAttempts) if (value.resetAt <= now) loginAttempts.delete(candidate);
  }
}

export function clearLoginFailures(key: string): void {
  loginAttempts.delete(key);
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}
