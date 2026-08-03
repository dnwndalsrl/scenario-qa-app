export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig();
  if (!config.public.appAuthEnabled || to.path === "/login") return;
  const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
  const session = await $fetch("/api/auth/session", { headers }).catch(() => ({ authenticated: false })) as { authenticated: boolean };
  if (!session.authenticated) return navigateTo({ path: "/login", query: { redirect: to.fullPath } });
});
