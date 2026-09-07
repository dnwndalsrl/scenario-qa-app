import { UI_AUDIT_VIEWPORTS } from "../../../../shared/ui-audit";
import type { UiAudit } from "../../../../shared/types/ui-audit";
import { buildUiAuditWorkbook, uiAuditWorkbookFileName } from "../../../services/ui-audit-workbook.service";
import { requireUser } from "../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const auditId = getRouterParam(event, "auditId") || "";
  const { data: row, error } = await client.from("ui_audits").select("*").eq("id", auditId).single();
  if (error || !row) throw createError({ statusCode: 404, statusMessage: "UI 점검 작업을 찾을 수 없습니다." });
  if (row.status !== "completed") throw createError({ statusCode: 409, statusMessage: "완료된 UI 점검만 다운로드할 수 있습니다." });

  const [{ data: issueRows }, { data: artifactRows }, { data: reviewRows }] = await Promise.all([
    client.from("ui_audit_issues").select("id,rule,severity,title,message,selector,state,artifact_source_id,actual").eq("audit_id", row.id).order("created_at"),
    client.from("ui_audit_artifacts").select("source_id,state,storage_path,width,height").eq("audit_id", row.id).order("created_at"),
    client.from("ui_audit_reviews").select("rule,status,note,updated_at").eq("audit_id", row.id).order("created_at"),
  ]);
  const artifacts = await Promise.all((artifactRows || []).map(async (artifact) => {
    const { data } = await client.storage.from("qa-ui-audit-artifacts").createSignedUrl(artifact.storage_path, 3600);
    return { id: artifact.source_id, state: artifact.state, width: artifact.width, height: artifact.height, signedUrl: data?.signedUrl };
  }));
  const audit: UiAudit = {
    id: row.id, name: row.name, targetUrl: row.target_url, normalizedUrl: row.normalized_url, status: row.status,
    currentMessage: row.current_message, viewport: UI_AUDIT_VIEWPORTS[row.viewport_preset as keyof typeof UI_AUDIT_VIEWPORTS],
    hasReference: row.has_reference, createdAt: row.created_at, completedAt: row.completed_at, error: row.error, summary: row.summary,
    issues: (issueRows || []).map((issue) => ({ id: issue.id, rule: issue.rule, severity: issue.severity, title: issue.title, message: issue.message, selector: issue.selector, state: issue.state, artifactSourceId: issue.artifact_source_id, actual: issue.actual })),
    artifacts,
    reviews: (reviewRows || []).map((review) => ({ rule: review.rule, status: review.status, note: review.note, updatedAt: review.updated_at })),
  };
  const fileName = uiAuditWorkbookFileName(audit);
  const workbook = await buildUiAuditWorkbook(audit);
  const fallbackFileName = `ui-qa-report-${(audit.completedAt || audit.createdAt).slice(0, 10).replaceAll("-", "")}.xlsx`;
  setResponseHeader(event, "Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  setResponseHeader(event, "Content-Disposition", `attachment; filename="${fallbackFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return workbook;
});
