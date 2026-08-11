import { getOwnedAnalysis } from "../../../../services/analysis-records.service";
import { dispatchAnalysisWorkflow, githubConfigFromRuntime } from "../../../../services/github-actions.service";
import { createServiceSupabaseClient, requireUser } from "../../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  if (analysis.process_stage !== "document_failed") throw createError({ statusCode: 409, statusMessage: "문서 분석 실패 상태에서만 문서 없이 계속할 수 있습니다." });
  const admin = createServiceSupabaseClient();
  await admin.from("requirement_documents").update({ status: "ignored" }).eq("analysis_id", analysisId);
  await admin.from("analyses").update({ status: "dispatching", process_stage: "page_analysis", progress: 2, current_message: "문서 없이 2단계 페이지 분석을 요청하고 있습니다.", error: null, completed_at: null }).eq("id", analysisId);
  try {
    await dispatchAnalysisWorkflow(analysisId, githubConfigFromRuntime(useRuntimeConfig(event)));
    await admin.from("analyses").update({ status: "dispatched", current_message: "2단계 페이지 분석 실행 대기 중입니다." }).eq("id", analysisId);
  } catch {
    await admin.from("analyses").update({ status: "dispatch_failed", process_stage: "failed", progress: 100 }).eq("id", analysisId);
    throw createError({ statusCode: 502, statusMessage: "GitHub Actions 실행 요청에 실패했습니다." });
  }
  setResponseStatus(event, 202);
  return { status: "dispatched" };
});
