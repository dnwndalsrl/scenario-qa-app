import { assertSameOrigin, clearSession } from "../../auth/auth.js";

export default defineEventHandler((event) => {
  assertSameOrigin(event);
  clearSession(event);
  return { authenticated: false };
});
