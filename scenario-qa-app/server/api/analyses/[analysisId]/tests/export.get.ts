import { getAnalysisDetailFromSupabase } from "../../../../services/analysis-records.service";
import { buildScenarioWorkbook, scenarioWorkbookFileName } from "../../../../services/scenario-workbook.service";
import { requireUser } from "../../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const detail = await getAnalysisDetailFromSupabase(client, getRouterParam(event, "analysisId") || "");
  if (!detail.generatedTests.length) throw createError({ statusCode: 409, statusMessage: "내보낼 테스트 시나리오가 없습니다." });
  const fileName = scenarioWorkbookFileName(detail);
  const workbook = await buildScenarioWorkbook(detail);
  setResponseHeader(event, "Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  setResponseHeader(event, "Content-Disposition", `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return workbook;
});
