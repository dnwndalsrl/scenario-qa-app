import { z } from "zod";
import { validatePublicTargetUrl } from "../../security/public-url-validator";
import { dispatchAnalysisWorkflow, githubConfigFromRuntime } from "../../services/github-actions.service";
import { createServiceSupabaseClient, requireUser } from "../../services/supabase.service";

const requestSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  options: z.object({
    mode: z.enum(["single_page", "site_crawl"]).default("single_page"),
    maxPages: z.number().int().min(1).max(5).default(3),
    maxDepth: z.number().int().min(0).max(2).default(1)
  }).default({ mode: "single_page", maxPages: 3, maxDepth: 1 })
});

export default defineEventHandler(async (event) => {
  const contentType = getHeader(event, "content-type") || "";
  let raw: unknown;
  let pdf: { data: Buffer; filename?: string; type?: string } | undefined;
  if (contentType.includes("multipart/form-data")) {
    const parts = await readMultipartFormData(event) || [];
    const requestPart = parts.find((part) => part.name === "request");
    const filePart = parts.find((part) => part.name === "requirements");
    try { raw = JSON.parse(requestPart?.data.toString("utf8") || "{}"); }
    catch { throw createError({ statusCode: 400, statusMessage: "분석 요청 형식이 올바르지 않습니다." }); }
    if (filePart?.data.length) pdf = filePart;
  } else raw = await readBody(event);

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "요청 값을 확인해 주세요.", data: { code: "INVALID_REQUEST", issues: parsed.error.issues } });
  if (pdf && (pdf.data.length > 10 * 1024 * 1024 || pdf.type !== "application/pdf" || pdf.data.subarray(0, 5).toString() !== "%PDF-")) {
    throw createError({ statusCode: 400, statusMessage: "10MB 이하의 정상적인 PDF 파일만 등록할 수 있습니다." });
  }

  const { client, user } = await requireUser(event);
  const normalizedUrl = await validatePublicTargetUrl(parsed.data.url);
  const options = parsed.data.options;
  const { data, error } = await client.rpc("create_analysis_job", {
    p_target_url: parsed.data.url, p_normalized_url: normalizedUrl, p_mode: options.mode,
    p_max_pages: options.mode === "single_page" ? 1 : options.maxPages,
    p_max_depth: options.mode === "single_page" ? 0 : options.maxDepth,
    p_auto_run: false, p_retry_of: null
  });
  if (error) throw createError({ statusCode: error.message.includes("LIMIT") ? 429 : 400, statusMessage: error.message, data: { code: error.message } });
  const job = Array.isArray(data) ? data[0] : data;
  if (!job?.id) throw createError({ statusCode: 500, statusMessage: "분석 작업을 생성하지 못했습니다." });

  const admin = createServiceSupabaseClient();
  const processStage = pdf ? "document_analysis" : "page_analysis";
  if (pdf) {
    const storagePath = `${user.id}/${job.id}/requirements.pdf`;
    const { error: uploadError } = await admin.storage.from("qa-requirements").upload(storagePath, pdf.data, { contentType: "application/pdf", upsert: false });
    const { error: rowError } = uploadError ? { error: uploadError } : await admin.from("requirement_documents").insert({
      analysis_id: job.id, user_id: user.id, file_name: (pdf.filename || "requirements.pdf").slice(0, 240), storage_path: storagePath,
      status: "pending", payload: { fileName: pdf.filename || "requirements.pdf", status: "pending", requirements: [], limitations: [] }
    });
    if (uploadError || rowError) {
      await admin.from("analyses").update({ status: "failed", process_stage: "document_failed", progress: 100, current_message: "PDF 저장에 실패했습니다.", error: { code: "DOCUMENT_UPLOAD_FAILED", message: "PDF 저장에 실패했습니다." } }).eq("id", job.id);
      throw createError({ statusCode: 500, statusMessage: "PDF 저장에 실패했습니다." });
    }
  }

  await admin.from("analyses").update({ status: "dispatching", process_stage: processStage, current_message: pdf ? "1단계 PDF 분석을 요청하고 있습니다." : "2단계 페이지 분석을 요청하고 있습니다." }).eq("id", job.id);
  try {
    await dispatchAnalysisWorkflow(job.id, githubConfigFromRuntime(useRuntimeConfig(event)));
    await admin.from("analyses").update({ status: "dispatched", current_message: pdf ? "1단계 문서 분석 실행 대기 중입니다." : "2단계 페이지 분석 실행 대기 중입니다." }).eq("id", job.id);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Workflow dispatch failed";
    await admin.from("analyses").update({ status: "dispatch_failed", process_stage: "failed", progress: 100, current_message: "실행 요청에 실패했습니다.", error: { code: "WORKFLOW_DISPATCH_FAILED", message }, completed_at: new Date().toISOString() }).eq("id", job.id);
    throw createError({ statusCode: 502, statusMessage: "GitHub Actions 실행 요청에 실패했습니다.", data: { code: "WORKFLOW_DISPATCH_FAILED" } });
  }
  setResponseStatus(event, 202);
  return { analysisId: job.id, status: "dispatched" };
});
