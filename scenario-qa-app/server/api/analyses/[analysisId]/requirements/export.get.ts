import { getAnalysisDetailFromSupabase } from "../../../../services/analysis-records.service";
import { rowToQaDefect } from "../../../../services/qa-defect.service";
import { buildRequirementWorkbook, requirementWorkbookFileName } from "../../../../services/requirement-workbook.service";
import { createServiceSupabaseClient, requireUser } from "../../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const detail = await getAnalysisDetailFromSupabase(client, analysisId);
  if (detail.documentAnalysis?.status !== "completed" || !detail.documentAnalysis.requirements.length) throw createError({ statusCode: 409, statusMessage: "내보낼 요구사항 분석 결과가 없습니다." });
  const { data, error } = await createServiceSupabaseClient(event).from("analysis_issues").select("id,analysis_id,title,severity,payload,created_at").eq("analysis_id", analysisId).eq("kind", "defect").order("created_at", { ascending: false });
  if (error) throw createError({ statusCode: 500, statusMessage: "결함 정보를 조회하지 못했습니다." });
  const fileName = requirementWorkbookFileName(detail);
  const workbook = await buildRequirementWorkbook(detail, (data || []).map(rowToQaDefect));
  setResponseHeader(event, "Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  setResponseHeader(event, "Content-Disposition", `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return workbook;
});
