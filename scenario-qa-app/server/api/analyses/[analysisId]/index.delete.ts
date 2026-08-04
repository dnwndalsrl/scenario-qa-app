import { getOwnedAnalysis, isActiveStatus } from "../../../services/analysis-records.service";
import { createServiceSupabaseClient, requireUser } from "../../../services/supabase.service";
export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event); const row = await getOwnedAnalysis(client, getRouterParam(event, "analysisId") || "");
  if (isActiveStatus(row.status)) throw createError({ statusCode: 409, statusMessage: "진행 중인 분석은 삭제할 수 없습니다." });
  const { data: artifacts } = await client.from("artifacts").select("storage_path").eq("analysis_id", row.id);
  const admin = createServiceSupabaseClient(); const paths = (artifacts || []).map((item) => item.storage_path);
  if (paths.length) await admin.storage.from("qa-artifacts").remove(paths);
  const { error } = await client.from("analyses").delete().eq("id", row.id);
  if (error) throw createError({ statusCode: 500, statusMessage: "분석 삭제에 실패했습니다." });
  setResponseStatus(event, 204); return null;
});
