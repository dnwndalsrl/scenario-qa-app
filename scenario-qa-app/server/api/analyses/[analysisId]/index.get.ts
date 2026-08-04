import { getAnalysisDetailFromSupabase } from "../../../services/analysis-records.service";
import { requireUser } from "../../../services/supabase.service";
import { recoverStaleAnalysis } from "../../../services/stale-analysis.service";
export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  await recoverStaleAnalysis(client, analysisId);
  return getAnalysisDetailFromSupabase(client, analysisId);
});
