import { UI_AUDIT_VIEWPORTS } from "../../../../shared/ui-audit";
import { requireUser } from "../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event); const auditId = getRouterParam(event, "auditId") || "";
  const { data: audit, error } = await client.from("ui_audits").select("*").eq("id", auditId).single();
  if (error || !audit) throw createError({ statusCode: 404, statusMessage: "UI 점검 작업을 찾을 수 없습니다." });
  const [{ data: reference },{ data: issueRows },{ data: artifactRows },{ data: reviewRows }] = await Promise.all([
    client.from("ui_design_references").select("id,file_name,storage_path,content_type,width,height").eq("audit_id", audit.id).maybeSingle(),
    client.from("ui_audit_issues").select("id,rule,severity,title,message,selector,state,artifact_source_id,actual").eq("audit_id",audit.id).order("created_at"),
    client.from("ui_audit_artifacts").select("source_id,state,storage_path,width,height").eq("audit_id",audit.id).order("created_at"),
    client.from("ui_audit_reviews").select("rule,status,note,updated_at").eq("audit_id",audit.id).order("created_at")
  ]);
  let signedUrl: string | undefined;
  if (reference?.storage_path) {
    const { data } = await client.storage.from("qa-ui-designs").createSignedUrl(reference.storage_path, 60);
    signedUrl = data?.signedUrl;
  }
  const artifacts=await Promise.all((artifactRows||[]).map(async(row)=>{ const {data}=await client.storage.from("qa-ui-audit-artifacts").createSignedUrl(row.storage_path,60); return {id:row.source_id,state:row.state,width:row.width,height:row.height,signedUrl:data?.signedUrl}; }));
  const viewport = UI_AUDIT_VIEWPORTS[audit.viewport_preset as keyof typeof UI_AUDIT_VIEWPORTS];
  return { audit: {
    id: audit.id, name: audit.name, targetUrl: audit.target_url, normalizedUrl: audit.normalized_url, status: audit.status, currentMessage:audit.current_message,
    viewport, hasReference: audit.has_reference, createdAt: audit.created_at, completedAt: audit.completed_at, error: audit.error, summary:audit.summary,
    issues:(issueRows||[]).map((row)=>({id:row.id,rule:row.rule,severity:row.severity,title:row.title,message:row.message,selector:row.selector,state:row.state,artifactSourceId:row.artifact_source_id,actual:row.actual})), artifacts,
    reviews:(reviewRows||[]).map((row)=>({rule:row.rule,status:row.status,note:row.note,updatedAt:row.updated_at})),
    reference: reference ? { id: reference.id, fileName: reference.file_name, contentType: reference.content_type, width: reference.width, height: reference.height, signedUrl } : undefined
  } };
});
