import type { UiAuditHistoryItem } from "../../../shared/types/ui-audit";
import { requireUser } from "../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const { data, error } = await client
    .from("ui_audits")
    .select("id,name,target_url,normalized_url,status,current_message,has_reference,summary,created_at,completed_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw createError({ statusCode: 500, statusMessage: "UI 점검 목록 조회에 실패했습니다." });

  const items: UiAuditHistoryItem[] = (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    targetUrl: row.target_url,
    normalizedUrl: row.normalized_url,
    status: row.status,
    currentMessage: row.current_message,
    hasReference: row.has_reference,
    summary: row.summary || undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined
  }));
  return { items };
});

