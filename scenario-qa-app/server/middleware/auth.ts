import { getRequestURL, sendRedirect } from "h3";
import { assertSameOrigin, authEnabled, getSession } from "../auth/auth.js";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/health/live"
]);

export default defineEventHandler(async (event) => {
  if (!authEnabled()) return;
  const url = getRequestURL(event);
  const path = url.pathname;
  if (PUBLIC_PATHS.has(path) || path.startsWith("/_nuxt/") || path === "/favicon.ico") return;

  if (["POST", "PUT", "PATCH", "DELETE"].includes(event.method)) assertSameOrigin(event);
  if (getSession(event) !== null) return;

  if (path.startsWith("/api/")) {
    throw createError({ statusCode: 401, statusMessage: "AUTH_REQUIRED", message: "로그인이 필요합니다." });
  }
  const redirect = encodeURIComponent(`${path}${url.search}`);
  return sendRedirect(event, `/login?redirect=${redirect}`, 302);
});
