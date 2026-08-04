import { dispatchAnalysisWorkflow, githubConfigFromRuntime } from "../../../services/github-actions.service";
import { getOwnedAnalysis } from "../../../services/analysis-records.service";
import { createServiceSupabaseClient, requireUser } from "../../../services/supabase.service";
export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event); const previous = await getOwnedAnalysis(client, getRouterParam(event, "analysisId") || "");
  if (!["completed","partially_completed","failed","dispatch_failed","cancelled"].includes(previous.status)) throw createError({ statusCode: 409, statusMessage: "진행 중인 분석은 재실행할 수 없습니다." });
  const { data, error } = await client.rpc("create_analysis_job", { p_target_url: previous.target_url, p_normalized_url: previous.normalized_url, p_mode: previous.mode, p_max_pages: previous.max_pages, p_max_depth: previous.max_depth, p_auto_run: previous.auto_run_safe_tests, p_retry_of: previous.id });
  if (error) throw createError({ statusCode: error.message.includes("LIMIT") ? 429 : 400, statusMessage: error.message });
  const job = Array.isArray(data) ? data[0] : data; const admin = createServiceSupabaseClient();
  try { await dispatchAnalysisWorkflow(job.id, githubConfigFromRuntime(useRuntimeConfig(event))); await admin.from("analyses").update({ status: "dispatched", current_message: "GitHub Actions 실행 대기 중입니다." }).eq("id", job.id); }
  catch { await admin.from("analyses").update({ status: "dispatch_failed", progress: 100, error: { code: "WORKFLOW_DISPATCH_FAILED", message: "GitHub Actions 실행 요청에 실패했습니다." } }).eq("id", job.id); throw createError({ statusCode: 502, statusMessage: "GitHub Actions 실행 요청에 실패했습니다." }); }
  setResponseStatus(event, 202); return { analysisId: job.id, status: "dispatched" };
});
