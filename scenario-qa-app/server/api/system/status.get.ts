import { requireUser } from "../../services/supabase.service";
export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event); const config = useRuntimeConfig(event);
  const started = Date.now(); const { error } = await client.from("analyses").select("id", { count: "exact", head: true });
  return {
    ok: !error, checkedAt: new Date().toISOString(), latencyMs: Date.now() - started,
    services: {
      vercelApi: { configured: true, role: "UI, authentication and workflow dispatch only" },
      supabase: { configured: Boolean(config.public.supabaseUrl && config.public.supabaseAnonKey), reachable: !error },
      githubActions: { configured: Boolean(config.githubOwner && config.githubRepo && config.githubToken), role: "Chromium, crawl, AI and test execution" }
    },
    limits: { maxPages: 5, defaultPages: 3, maxDepth: 2, defaultDepth: 1, dailyPerUser: 20, concurrentPerUser: 1, workflowTimeoutMinutes: 10 }
  };
});
