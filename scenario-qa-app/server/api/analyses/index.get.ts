import { rowToAnalysis } from "../../services/analysis-records.service";
import { requireUser } from "../../services/supabase.service";
import { recoverStaleAnalyses } from "../../services/stale-analysis.service";
export default defineEventHandler(async (event) => {
  await recoverStaleAnalyses();
  const { client } = await requireUser(event);
  const { data, error } = await client.from("analyses").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) throw createError({ statusCode: 500, statusMessage: "분석 목록 조회에 실패했습니다." });
  return { items: (data || []).map(rowToAnalysis) };
});
