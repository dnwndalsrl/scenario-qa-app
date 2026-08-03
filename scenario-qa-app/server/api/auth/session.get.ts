import { authEnabled, getSession } from "../../auth/auth.js";

export default defineEventHandler((event) => {
  const session = getSession(event);
  return {
    enabled: authEnabled(),
    authenticated: session !== null,
    username: session?.username ?? null
  };
});
