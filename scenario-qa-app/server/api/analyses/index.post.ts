import { z } from "zod";
import { validatePublicTargetUrl } from "../../security/public-url-validator";
import { dispatchAnalysisWorkflow, githubConfigFromRuntime } from "../../services/github-actions.service";
import { createServiceSupabaseClient, requireUser } from "../../services/supabase.service";

const requestSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  options: z.object({
    mode: z.enum(["single_page", "site_crawl"]).default("single_page"),
    maxPages: z.number().int().min(1).max(5).default(3),
    maxDepth: z.number().int().min(0).max(2).default(1),
    autoRunSafeTests: z.boolean().default(true)
  }).default({ mode: "single_page", maxPages: 3, maxDepth: 1, autoRunSafeTests: true })
});

export default defineEventHandler(async (event) => {
  const parsed = requestSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "요청 값이 올바르지 않습니다.", data: { code: "INVALID_REQUEST", issues: parsed.error.issues } });
  const { client } = await requireUser(event);
  const normalizedUrl = await validatePublicTargetUrl(parsed.data.url);
  const options = parsed.data.options;
  const { data, error } = await client.rpc("create_analysis_job", {
    p_target_url: parsed.data.url, p_normalized_url: normalizedUrl, p_mode: options.mode,
    p_max_pages: options.mode === "single_page" ? 1 : options.maxPages,
    p_max_depth: options.mode === "single_page" ? 0 : options.maxDepth,
    p_auto_run: options.autoRunSafeTests, p_retry_of: null
  });
  if (error) throw createError({ statusCode: error.message.includes("LIMIT") ? 429 : 400, statusMessage: error.message, data: { code: error.message } });
  const job = Array.isArray(data) ? data[0] : data;
  if (!job?.id) throw createError({ statusCode: 500, statusMessage: "분석 작업 생성 결과가 없습니다." });
  const admin = createServiceSupabaseClient();
  await admin.from("analyses").update({ status: "dispatching", current_message: "GitHub Actions 실행을 요청하고 있습니다." }).eq("id", job.id);
  try {
    await dispatchAnalysisWorkflow(job.id, githubConfigFromRuntime(useRuntimeConfig(event)));
    await admin.from("analyses").update({ status: "dispatched", current_message: "GitHub Actions 실행 대기 중입니다." }).eq("id", job.id);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Workflow dispatch failed";
    await admin.from("analyses").update({ status: "dispatch_failed", progress: 100, current_message: "실행 요청에 실패했습니다.", error: { code: "WORKFLOW_DISPATCH_FAILED", message }, completed_at: new Date().toISOString() }).eq("id", job.id);
    throw createError({ statusCode: 502, statusMessage: "GitHub Actions 실행 요청에 실패했습니다.", data: { code: "WORKFLOW_DISPATCH_FAILED" } });
  }
  setResponseStatus(event, 202);
  return { analysisId: job.id, status: "dispatched" };
});
