import { rowToAnalysis } from "../services/analysis-records.service";
import { requireUser } from "../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const [analyses, usage] = await Promise.all([
    client.from("analyses").select("*").order("created_at", { ascending: false }).limit(5),
    client.rpc("get_usage_summary")
  ]);

  if (usage.error) throw createError({ statusCode: 500, statusMessage: "사용량을 조회하지 못했습니다." });

  return {
    items: analyses.error ? [] : (analyses.data || []).map(rowToAnalysis),
    usage: usage.data
  };
});
