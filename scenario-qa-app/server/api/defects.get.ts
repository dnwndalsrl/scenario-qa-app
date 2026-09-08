import { rowToQaDefect } from "../services/qa-defect.service";
import { requireUser } from "../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const [{ data, error }, { data: uiRows, error: uiError }] = await Promise.all([client.from("analysis_issues")
    .select("id,analysis_id,title,severity,payload,created_at")
    .eq("kind", "defect")
    .order("created_at", { ascending: false })
    .limit(500), client.from("ui_audit_reviews").select("defect_payload").not("defect_id", "is", null)]);
  if (error || uiError) throw createError({ statusCode: 500, statusMessage: "통합 결함 목록을 조회하지 못했습니다." });
  const defects = [...(data || []).map(rowToQaDefect), ...(uiRows || []).map((row) => row.defect_payload).filter(Boolean)];
  return { defects: defects.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500) };
});
