import { rowToAnalysis } from "../services/analysis-records.service";
import { createServiceSupabaseClient, requireUser } from "../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client, user } = await requireUser(event);
  const serviceClient = createServiceSupabaseClient();
  const [analyses, usage] = await Promise.all([
    serviceClient.from("analyses").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    client.rpc("get_usage_summary")
  ]);

  if (analyses.error) throw createError({ statusCode: 500, statusMessage: "분석 목록 조회에 실패했습니다." });
  if (usage.error) throw createError({ statusCode: 500, statusMessage: "사용량을 조회하지 못했습니다." });

  return {
    items: (analyses.data || []).map(rowToAnalysis),
    usage: usage.data
  };
});
