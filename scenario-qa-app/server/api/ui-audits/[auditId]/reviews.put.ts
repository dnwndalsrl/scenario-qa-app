import type { UiAuditReviewStatus, UiAuditRule } from "../../../../shared/types/ui-audit";
import { UI_AUDIT_REVIEW_STATUSES } from "../../../../shared/utils/ui-audit-review";
import { requireUser } from "../../../services/supabase.service";

const rules: UiAuditRule[] = ["horizontal_overflow", "clipped_content", "element_overlap", "small_target", "low_contrast"];

export default defineEventHandler(async (event) => {
  const auditId = getRouterParam(event, "auditId") || "";
  const body = await readBody<{ rule?: UiAuditRule; status?: UiAuditReviewStatus; note?: string }>(event);
  if (!rules.includes(body.rule as UiAuditRule) || !UI_AUDIT_REVIEW_STATUSES.includes(body.status as UiAuditReviewStatus) || typeof body.note !== "string" || body.note.length > 1000) {
    throw createError({ statusCode: 400, statusMessage: "판정 내용을 확인해 주세요." });
  }
  const { client, user } = await requireUser(event);
  const { data: audit } = await client.from("ui_audits").select("id").eq("id", auditId).maybeSingle();
  if (!audit) throw createError({ statusCode: 404, statusMessage: "UI 점검 작업을 찾을 수 없습니다." });

  const updatedAt = new Date().toISOString();
  const { data, error } = await client.from("ui_audit_reviews").upsert({
    audit_id: auditId, user_id: user.id, rule: body.rule, status: body.status, note: body.note.trim(), updated_at: updatedAt,
  }, { onConflict: "audit_id,rule" }).select("rule,status,note,updated_at").single();
  if (error || !data) throw createError({ statusCode: 500, statusMessage: "판정을 저장하지 못했습니다." });
  return { review: { rule: data.rule, status: data.status, note: data.note, updatedAt: data.updated_at } };
});
