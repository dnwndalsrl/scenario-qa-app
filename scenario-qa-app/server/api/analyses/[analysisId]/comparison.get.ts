import { buildRegressionComparison } from "../../../../shared/utils/regression-comparison";
import { getAnalysisDetailFromSupabase, getOwnedAnalysis } from "../../../services/analysis-records.service";
import { requireUser } from "../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const current = await getOwnedAnalysis(client, analysisId);
  if (!["completed", "partially_completed"].includes(current.status)) return { comparison: null };

  const { data: baseline, error } = await client.from("analyses")
    .select("id")
    .eq("normalized_url", current.normalized_url)
    .eq("mode", current.mode)
    .in("status", ["completed", "partially_completed"])
    .lt("created_at", current.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "이전 분석을 조회하지 못했습니다." });
  if (!baseline) return { comparison: null };

  const [currentDetail, baselineDetail] = await Promise.all([
    getAnalysisDetailFromSupabase(client, analysisId),
    getAnalysisDetailFromSupabase(client, baseline.id)
  ]);
  return { comparison: buildRegressionComparison(currentDetail, baselineDetail) };
});
