import { getOwnedAnalysis } from "../../../services/analysis-records.service";
import { rowToQaDefect } from "../../../services/qa-defect.service";
import { createServiceSupabaseClient, requireUser } from "../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  await getOwnedAnalysis(client, analysisId);
  const { data, error } = await createServiceSupabaseClient(event).from("analysis_issues").select("id,analysis_id,title,severity,payload,created_at").eq("analysis_id", analysisId).eq("kind", "defect").order("created_at", { ascending: false });
  if (error) throw createError({ statusCode: 500, statusMessage: "결함 목록을 조회하지 못했습니다." });
  return { defects: (data || []).map(rowToQaDefect) };
});
