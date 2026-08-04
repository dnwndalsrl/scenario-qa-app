import { rowToAnalysis } from "../../services/analysis-records.service";
import { requireUser } from "../../services/supabase.service";
export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const { data, error } = await client.from("analyses").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) throw createError({ statusCode: 500, statusMessage: "분석 목록 조회에 실패했습니다." });
  return { items: (data || []).map(rowToAnalysis) };
});
