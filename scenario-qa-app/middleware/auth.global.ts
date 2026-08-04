export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/login") return;
  const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
  try {
    const session = await $fetch<{ authenticated: boolean }>("/api/auth/session", { headers });
    if (!session.authenticated) return navigateTo({ path: "/login", query: { redirect: to.fullPath } });
  } catch { return navigateTo({ path: "/login", query: { redirect: to.fullPath } }); }
});
