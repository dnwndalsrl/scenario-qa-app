import { operationalLog } from "../../utils/operational-logger.js";
import {
  assertLoginAllowed,
  assertSameOrigin,
  clearLoginFailures,
  loginRateLimitKey,
  recordLoginFailure,
  setSession,
  verifyPassword
} from "../../auth/auth.js";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const body = await readBody<{ username?: unknown; password?: unknown }>(event);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const key = loginRateLimitKey(event, username);
  assertLoginAllowed(key);

  const usernameMatches = username === (process.env.APP_AUTH_USERNAME ?? "");
  const passwordMatches = verifyPassword(password, process.env.APP_AUTH_PASSWORD_HASH ?? "");
  if (!usernameMatches || !passwordMatches) {
    recordLoginFailure(key);
    operationalLog("warn", "auth_login_failed", { attemptKey: key, errorCode: "AUTH_INVALID_CREDENTIALS" });
    throw createError({ statusCode: 401, statusMessage: "AUTH_INVALID_CREDENTIALS", message: "아이디 또는 비밀번호가 올바르지 않습니다." });
  }

  clearLoginFailures(key);
  setSession(event, username);
  operationalLog("info", "auth_login_succeeded", { username, status: "success" });
  return { authenticated: true, username };
});
