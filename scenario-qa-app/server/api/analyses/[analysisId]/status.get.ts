import { getOwnedAnalysis, rowToAnalysis } from "../../../services/analysis-records.service";
import { requireUser } from "../../../services/supabase.service";
export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event); const row = await getOwnedAnalysis(client, getRouterParam(event, "analysisId") || "");
  const analysis = rowToAnalysis(row); return { id: analysis.id, status: analysis.status, progress: analysis.progress, currentMessage: analysis.currentMessage, error: analysis.error, updatedAt: analysis.updatedAt };
});
