import type { UiAuditIssue } from "../../../../shared/types/ui-audit";
import { buildUiAuditDefect, uiAuditDefectCreateSchema } from "../../../services/ui-audit-defect.service";
import { requireUser } from "../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client, user } = await requireUser(event);
  const auditId = getRouterParam(event, "auditId") || "";
  const parsed = uiAuditDefectCreateSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "결함 등록 내용을 확인해 주세요." });
  const { data: audit } = await client.from("ui_audits").select("id,target_url").eq("id", auditId).maybeSingle();
  if (!audit) throw createError({ statusCode: 404, statusMessage: "UI 점검 작업을 찾을 수 없습니다." });
  const { data: review } = await client.from("ui_audit_reviews").select("status,defect_id").eq("audit_id", auditId).eq("rule", parsed.data.rule).maybeSingle();
  if (!review || review.status !== "fix_required") throw createError({ statusCode: 409, statusMessage: "수정 필요로 판정한 항목만 결함으로 등록할 수 있습니다." });
  if (review.defect_id) throw createError({ statusCode: 409, statusMessage: "이미 결함으로 등록된 항목입니다." });
  const { data: issueRows } = await client.from("ui_audit_issues").select("id,rule,severity,title,message,selector,state,artifact_source_id,actual").eq("audit_id", auditId).eq("rule", parsed.data.rule);
  if (!issueRows?.length) throw createError({ statusCode: 404, statusMessage: "등록할 UI 문제를 찾을 수 없습니다." });
  const issues = issueRows.map((issue) => ({ id: issue.id, rule: issue.rule, severity: issue.severity, title: issue.title, message: issue.message, selector: issue.selector, state: issue.state, artifactSourceId: issue.artifact_source_id, actual: issue.actual })) as UiAuditIssue[];
  const defect = buildUiAuditDefect(parsed.data, { id: audit.id, targetUrl: audit.target_url }, issues, user.email || user.id, new Date().toISOString());
  const { data: updated, error } = await client.from("ui_audit_reviews").update({ defect_id: defect.id, defect_payload: defect }).eq("audit_id", auditId).eq("rule", parsed.data.rule).is("defect_id", null).select("defect_id").maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "결함을 저장하지 못했습니다." });
  if (!updated) throw createError({ statusCode: 409, statusMessage: "이미 결함으로 등록된 항목입니다." });
  setResponseStatus(event, 201);
  return { defect };
});
