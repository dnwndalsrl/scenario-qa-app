import { getOwnedAnalysis, isActiveStatus } from "../../../services/analysis-records.service";
import { createServiceSupabaseClient, requireUser } from "../../../services/supabase.service";
export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event); const row = await getOwnedAnalysis(client, getRouterParam(event, "analysisId") || "");
  if (!isActiveStatus(row.status)) throw createError({ statusCode: 409, statusMessage: "취소할 수 있는 상태가 아닙니다." });
  const { error } = await createServiceSupabaseClient().from("analyses").update({ cancel_requested: true, status: "cancel_requested", current_message: "취소 요청을 실행기에 전달했습니다." }).eq("id", row.id).eq("user_id", row.user_id);
  if (error) throw createError({ statusCode: 500, statusMessage: "취소 요청 저장에 실패했습니다." });
  return { analysisId: row.id, status: "cancel_requested" };
});
