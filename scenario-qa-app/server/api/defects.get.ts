import { rowToQaDefect } from "../services/qa-defect.service";
import { requireUser } from "../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const { data, error } = await client.from("analysis_issues")
    .select("id,analysis_id,title,severity,payload,created_at")
    .eq("kind", "defect")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw createError({ statusCode: 500, statusMessage: "통합 결함 목록을 조회하지 못했습니다." });
  return { defects: (data || []).map(rowToQaDefect) };
});
