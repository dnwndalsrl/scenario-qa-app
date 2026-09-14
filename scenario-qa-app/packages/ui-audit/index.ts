import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { collectUiAuditPage } from "../../server/playwright/ui-audit-collector";
import { compareUiDesign } from "../../server/playwright/ui-design-comparison";

export type UiAuditStage = "browser_start" | "page_collection" | "design_comparison" | "artifact_upload" | "artifact_metadata" | "issue_storage" | "completion_update";
type UiAuditDiagnostic = { auditId: string; stage: UiAuditStage; code: string; type: string; message: string };
const stageMessages: Record<UiAuditStage, string> = {
  browser_start: "브라우저 시작 단계에서 실패했습니다.", page_collection: "화면 수집 단계에서 실패했습니다.",
  design_comparison: "디자인 비교 단계에서 실패했습니다.", artifact_upload: "화면 이미지 업로드 단계에서 실패했습니다.",
  artifact_metadata: "화면 이미지 정보 저장 단계에서 실패했습니다.", issue_storage: "문제 목록 저장 단계에서 실패했습니다.",
  completion_update: "완료 상태 저장 단계에서 실패했습니다."
};
function safeToken(value: unknown, fallback: string) { return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : fallback; }
export function createUiAuditDiagnostic(auditId: string, stage: UiAuditStage, cause: unknown): UiAuditDiagnostic {
  const record = cause && typeof cause === "object" ? cause as Record<string, unknown> : {};
  return { auditId: safeToken(auditId, "unknown"), stage, code: safeToken(record.code, `UI_AUDIT_${stage.toUpperCase()}_FAILED`), type: safeToken(cause instanceof Error ? cause.name : record.name, "UnknownError"), message: stageMessages[stage] };
}
export class UiAuditExecutionError extends Error {
  constructor(readonly diagnostic: UiAuditDiagnostic, override readonly cause: unknown) { super(diagnostic.message); this.name = "UiAuditExecutionError"; }
}
export function formatUiAuditDiagnostic(error: unknown, auditId: string) {
  return JSON.stringify(error instanceof UiAuditExecutionError ? error.diagnostic : createUiAuditDiagnostic(auditId, "browser_start", error));
}
function env(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }

export async function runUiAudit(auditId: string) {
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: audit, error } = await client.from("ui_audits").select("*").eq("id", auditId).single();
  if (error || !audit) throw new Error("UI audit job not found");
  if (audit.status !== "queued") throw new Error(`UI audit is not runnable from status ${audit.status}`);
  let stage: UiAuditStage = "browser_start";
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const running = await client.from("ui_audits").update({ status: "running", current_message: "화면 상태와 UI 측정값을 수집하고 있습니다.", started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", auditId);
    if (running.error) throw running.error;
    browser = await chromium.launch({ headless: true });
    stage = "page_collection";
    const page = await browser.newPage();
    const result = await collectUiAuditPage(page, audit.normalized_url, { width: audit.viewport_width, height: audit.viewport_height });
    const screenshotCount = result.artifacts.length;
    let comparison: Awaited<ReturnType<typeof compareUiDesign>> | undefined;
    if (audit.has_reference) {
      stage = "design_comparison";
      const { data: reference, error: referenceError } = await client.from("ui_design_references").select("storage_path,content_type,width,height").eq("audit_id", auditId).single();
      if (referenceError || !reference) throw referenceError || new Error("Design reference missing");
      const { data: referenceFile, error: downloadError } = await client.storage.from("qa-ui-designs").download(reference.storage_path);
      if (downloadError || !referenceFile) throw downloadError || new Error("Design reference download failed");
      const actual = result.artifacts.find((artifact) => artifact.state === "initial");
      if (!actual) throw new Error("Initial artifact missing");
      comparison = await compareUiDesign(page, { referenceBytes: Buffer.from(await referenceFile.arrayBuffer()), referenceContentType: reference.content_type as "image/png" | "image/jpeg", referenceWidth: reference.width, referenceHeight: reference.height, actualBytes: actual.bytes, actualWidth: actual.width, actualHeight: actual.height });
      result.artifacts.push({ sourceId: "ui-design-diff", state: "design_diff", width: actual.width, height: actual.height, bytes: comparison.diffBytes });
    }
    for (const artifact of result.artifacts) {
      const path = `${audit.user_id}/${auditId}/${artifact.sourceId}.png`;
      stage = "artifact_upload";
      const uploaded = await client.storage.from("qa-ui-audit-artifacts").upload(path, artifact.bytes, { contentType: "image/png", upsert: false });
      if (uploaded.error) throw uploaded.error;
      stage = "artifact_metadata";
      const saved = await client.from("ui_audit_artifacts").insert({ audit_id: auditId, user_id: audit.user_id, source_id: artifact.sourceId, state: artifact.state, storage_path: path, width: artifact.width, height: artifact.height, size_bytes: artifact.bytes.length });
      if (saved.error) throw saved.error;
    }
    if (result.issues.length) {
      stage = "issue_storage";
      const saved = await client.from("ui_audit_issues").insert(result.issues.map((issue) => ({ audit_id: auditId, user_id: audit.user_id, rule: issue.rule, severity: issue.severity, title: issue.title, message: issue.message, selector: issue.selector, state: issue.state, artifact_source_id: issue.artifactSourceId, actual: issue.actual })));
      if (saved.error) throw saved.error;
    }
    const summary = { issueCount: result.issues.length, highCount: result.issues.filter((item) => item.severity === "high").length, mediumCount: result.issues.filter((item) => item.severity === "medium").length, lowCount: result.issues.filter((item) => item.severity === "low").length, screenshotCount, ...(comparison ? { comparison: comparison.summary } : {}) };
    stage = "completion_update";
    const completed = await client.from("ui_audits").update({ status: "completed", current_message: comparison ? "규칙 기반 UI 점검과 디자인 비교가 완료되었습니다." : "규칙 기반 UI 점검이 완료되었습니다.", summary, error: null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", auditId);
    if (completed.error) throw completed.error;
  } catch (cause) {
    const diagnostic = createUiAuditDiagnostic(auditId, stage, cause);
    const failed = await client.from("ui_audits").update({ status: "failed", current_message: diagnostic.message, error: { code: "UI_AUDIT_RUNNER_FAILED", message: diagnostic.message, auditId: diagnostic.auditId, stage, errorCode: diagnostic.code, errorType: diagnostic.type }, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", auditId);
    if (failed.error) console.error(JSON.stringify({ auditId: diagnostic.auditId, stage, code: "FAILURE_STATE_SAVE_FAILED", type: "PersistenceError" }));
    throw new UiAuditExecutionError(diagnostic, cause);
  } finally {
    if (browser) try { await browser.close(); } catch { console.error(JSON.stringify({ auditId: safeToken(auditId, "unknown"), stage, code: "BROWSER_CLOSE_FAILED", type: "BrowserError" })); }
  }
}
