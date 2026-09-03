import { createUiAuditSchema } from "../../../shared/schemas/ui-audit";
import { UI_AUDIT_VIEWPORTS } from "../../../shared/ui-audit";
import { validatePublicTargetUrl } from "../../security/public-url-validator";
import { dispatchUiAuditWorkflow, githubConfigFromRuntime } from "../../services/github-actions.service";
import { createServiceSupabaseClient, requireUser } from "../../services/supabase.service";
import { inspectDesignImage, saveUiDesignReference, UiDesignReferenceError } from "../../services/ui-design-reference.service";

export default defineEventHandler(async (event) => {
  const contentType = getHeader(event, "content-type") || "";
  if (!contentType.includes("multipart/form-data")) throw createError({ statusCode: 400, statusMessage: "UI 점검 요청 형식이 올바르지 않습니다." });
  const parts = await readMultipartFormData(event) || [];
  const requestPart = parts.find((part) => part.name === "request");
  const designPart = parts.find((part) => part.name === "design" && part.data.length);
  let raw: unknown;
  try { raw = JSON.parse(requestPart?.data.toString("utf8") || "{}"); }
  catch { throw createError({ statusCode: 400, statusMessage: "UI 점검 요청 형식이 올바르지 않습니다." }); }
  const parsed = createUiAuditSchema.safeParse(raw);
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "UI 점검 요청 값을 확인해 주세요.", data: { code: "INVALID_UI_AUDIT_REQUEST", issues: parsed.error.issues } });
  let design: { bytes: Buffer; fileName: string; metadata: ReturnType<typeof inspectDesignImage> } | undefined;
  if (designPart) {
    try { design = { bytes: designPart.data, fileName: designPart.filename || "design", metadata: inspectDesignImage(designPart.data, designPart.type) }; }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : "디자인 이미지를 확인해 주세요.";
      throw createError({ statusCode: 400, statusMessage: message, data: { code: cause instanceof UiDesignReferenceError ? cause.code : "INVALID_DESIGN_IMAGE" } });
    }
  }
  const { client, user } = await requireUser(event);
  const normalizedUrl = await validatePublicTargetUrl(parsed.data.url);
  const viewport = UI_AUDIT_VIEWPORTS[parsed.data.viewportPreset];
  const { data, error } = await client.rpc("create_ui_audit", {
    p_target_url: parsed.data.url, p_normalized_url: normalizedUrl, p_name: parsed.data.name,
    p_viewport_preset: viewport.preset, p_viewport_width: viewport.width, p_viewport_height: viewport.height, p_has_reference: Boolean(design)
  });
  if (error) throw createError({ statusCode: 400, statusMessage: error.message, data: { code: error.message } });
  const audit = Array.isArray(data) ? data[0] : data;
  if (!audit?.id) throw createError({ statusCode: 500, statusMessage: "UI 점검 작업을 생성하지 못했습니다." });
  if (design) {
    try { await saveUiDesignReference(client, { auditId: audit.id, userId: user.id, fileName: design.fileName, bytes: design.bytes, metadata: design.metadata }); }
    catch (cause) {
      await client.from("ui_audits").delete().eq("id", audit.id);
      console.error("[ui-design-reference-save]", { auditId: audit.id, code: cause instanceof UiDesignReferenceError ? cause.code : "DESIGN_SAVE_FAILED" });
      throw createError({ statusCode: 500, statusMessage: "디자인 원본 저장에 실패했습니다.", data: { code: cause instanceof UiDesignReferenceError ? cause.code : "DESIGN_SAVE_FAILED" } });
    }
  }
  const admin = createServiceSupabaseClient(event);
  try {
    await dispatchUiAuditWorkflow(audit.id, githubConfigFromRuntime(useRuntimeConfig(event)));
    await admin.from("ui_audits").update({ current_message: "UI 점검 실행기가 시작되기를 기다리고 있습니다.", dispatched_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", audit.id);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Workflow dispatch failed";
    await admin.from("ui_audits").update({ status: "failed", current_message: "UI 점검 실행 요청에 실패했습니다.", error: { code: "WORKFLOW_DISPATCH_FAILED", message }, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", audit.id);
    throw createError({ statusCode: 502, statusMessage: "UI 점검 실행 요청에 실패했습니다.", data: { code: "WORKFLOW_DISPATCH_FAILED" } });
  }
  setResponseStatus(event, 202);
  return { auditId: audit.id, status: "queued" };
});
