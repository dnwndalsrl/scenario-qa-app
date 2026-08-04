export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/login") return;
  const session = useAuthSession();
  if (session.value?.authenticated) return;
  const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
  try {
    const result = await $fetch("/api/auth/session", { headers });
    session.value = result;
    if (!result.authenticated) return navigateTo({ path: "/login", query: { redirect: to.fullPath } });
  } catch { return navigateTo({ path: "/login", query: { redirect: to.fullPath } }); }
});
