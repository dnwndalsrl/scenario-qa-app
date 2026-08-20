import { githubConfigFromRuntime, latestWorkflowRun } from "../../services/github-actions.service";
import { requireUser } from "../../services/supabase.service";
export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event); const config = useRuntimeConfig(event);
  const started = Date.now(); const { error } = await client.from("analyses").select("id", { count: "exact", head: true });
  const github = githubConfigFromRuntime(config);
  const githubConfigured = Boolean(github.token && github.owner && github.repo);
  let regression: Awaited<ReturnType<typeof latestWorkflowRun>>;
  let regressionReachable = false;
  if (githubConfigured) {
    try { regression = await latestWorkflowRun(github, "production-regression.yml"); regressionReachable = true; }
    catch { regressionReachable = false; }
  }
  return {
    ok: !error, checkedAt: new Date().toISOString(), latencyMs: Date.now() - started,
    services: {
      vercelApi: { configured: true, role: "UI, authentication and workflow dispatch only" },
      supabase: { configured: Boolean(config.public.supabaseUrl && config.public.supabaseAnonKey), reachable: !error },
      githubActions: { configured: githubConfigured, role: "Chromium, crawl, AI and test execution" }
    },
    productionRegression: {
      configured: githubConfigured, reachable: regressionReachable, status: regression?.status || "not_run", conclusion: regression?.conclusion,
      runNumber: regression?.runNumber, url: regression?.url, checkedAt: regression?.updatedAt, commitSha: regression?.commitSha
    },
    limits: { maxPages: 5, defaultPages: 3, maxDepth: 2, defaultDepth: 1, dailyPerUser: 20, concurrentPerUser: 1, workflowTimeoutMinutes: 10 }
  };
});
