import { getAnalysisDetailFromSupabase } from "../../../../services/analysis-records.service";
import { requireUser } from "../../../../services/supabase.service";
export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event); const detail = await getAnalysisDetailFromSupabase(client, getRouterParam(event, "analysisId") || "");
  const page = detail.pages.find((item) => item.page.id === getRouterParam(event, "pageId"));
  if (!page) throw createError({ statusCode: 404, statusMessage: "페이지 분석 결과를 찾을 수 없습니다." }); return page;
});
