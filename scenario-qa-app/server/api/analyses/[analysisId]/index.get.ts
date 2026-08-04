import { getAnalysisDetailFromSupabase } from "../../../services/analysis-records.service";
import { requireUser } from "../../../services/supabase.service";
import { recoverStaleAnalyses } from "../../../services/stale-analysis.service";
export default defineEventHandler(async (event) => {
  await recoverStaleAnalyses();
  const { client } = await requireUser(event);
  return getAnalysisDetailFromSupabase(client, getRouterParam(event, "analysisId") || "");
});
