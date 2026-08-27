import type { QaDefect } from "../../../../../shared/types/analysis";
import { getOwnedAnalysis } from "../../../../services/analysis-records.service";
import { applyQaDefectUpdate, qaDefectUpdateSchema } from "../../../../services/qa-defect.service";
import { createServiceSupabaseClient, requireUser } from "../../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client, user } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const defectId = getRouterParam(event, "defectId") || "";
  await getOwnedAnalysis(client, analysisId);
  const parsed = qaDefectUpdateSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "변경할 결함 내용을 확인해 주세요." });
  const admin = createServiceSupabaseClient(event);
  const { data: row, error: readError } = await admin.from("analysis_issues").select("payload").eq("id", defectId).eq("analysis_id", analysisId).eq("kind", "defect").maybeSingle();
  if (readError || !row) throw createError({ statusCode: 404, statusMessage: "결함을 찾을 수 없습니다." });
  const defect = applyQaDefectUpdate(row.payload as QaDefect, parsed.data, user.email || user.id, new Date().toISOString());
  const { error } = await admin.from("analysis_issues").update({ severity: defect.severity, title: defect.title, payload: defect }).eq("id", defectId).eq("analysis_id", analysisId);
  if (error) throw createError({ statusCode: 500, statusMessage: "결함 상태를 저장하지 못했습니다." });
  return { defect };
});
