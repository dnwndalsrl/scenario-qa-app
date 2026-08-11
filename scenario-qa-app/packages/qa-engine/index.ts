import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AnalysisDetail, RequirementDocumentAnalysis, SiteAnalysisStatus } from "../../shared/types/analysis";

const terminal = new Set<SiteAnalysisStatus>(["completed", "partially_completed", "failed"]);

function env(name: string): string {
  const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value;
}
function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}
async function update(client: SupabaseClient, id: string, values: Record<string, unknown>) {
  const { error } = await client.from("analyses").update(values).eq("id", id); if (error) throw error;
}
async function checkCancelled(client: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await client.from("analyses").select("cancel_requested").eq("id", id).single(); if (error) throw error;
  if (data.cancel_requested) { await update(client, id, { status: "cancelled", progress: 100, current_message: "사용자 요청으로 취소되었습니다.", completed_at: new Date().toISOString() }); throw new Error("ANALYSIS_CANCELLED"); }
}

export async function runQaAnalysis(analysisId: string): Promise<void> {
  const client = adminClient();
  const { data: job, error } = await client.from("analyses").select("*").eq("id", analysisId).single();
  if (error || !job) throw new Error("Analysis job not found");
  await checkCancelled(client, analysisId);
  if (!["queued", "dispatching", "dispatched"].includes(job.status)) throw new Error(`Analysis is not runnable from status ${job.status}`);
  const workRoot = path.resolve(process.cwd(), ".qa-runs", analysisId); await mkdir(workRoot, { recursive: true });
  process.env.NUXT_STORAGE_ROOT = workRoot;
  process.env.MAX_CRAWL_PAGES = "5"; process.env.DEFAULT_CRAWL_PAGES = "3";
  process.env.MAX_CRAWL_DEPTH = "2"; process.env.DEFAULT_CRAWL_DEPTH = "1";
  process.env.MAX_TOTAL_AUTO_RUN_TESTS = "8"; process.env.MAX_TOTAL_GENERATED_TESTS = "8";
  process.env.MAX_ANALYSIS_EXECUTION_MS = process.env.MAX_ANALYSIS_EXECUTION_MS || "540000";
  const githubRunId = process.env.GITHUB_RUN_ID && /^\d+$/.test(process.env.GITHUB_RUN_ID) ? Number(process.env.GITHUB_RUN_ID) : null;
  const githubRunUrl = githubRunId && process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${githubRunId}` : null;
  await update(client, analysisId, { status: "running", progress: 2, current_message: "GitHub Actions 실행기가 분석을 시작했습니다.", started_at: new Date().toISOString(), github_run_id: githubRunId, github_run_url: githubRunUrl });
  const workflow = await client.from("workflow_runs").insert({ analysis_id: analysisId, user_id: job.user_id, status: "running", runner_name: process.env.RUNNER_NAME || "local-cli", sha: process.env.GITHUB_SHA || null, github_run_id: githubRunId, github_run_url: githubRunUrl, payload: { runAttempt: process.env.GITHUB_RUN_ATTEMPT || null } }).select("id").single();
  try {
    const documentAnalysis = await prepareRequirementDocument(client, analysisId);
    await update(client, analysisId, { process_stage: "page_analysis", current_message: "2단계 페이지 분석과 테스트 시나리오 생성을 시작합니다." });
    const engine = await import("../../server/analysis/services/site-analysis.service");
    const local = await engine.createSiteAnalysis(job.normalized_url, { mode: job.mode, maxPages: job.max_pages, maxDepth: job.max_depth, autoRunSafeTests: false, documentAnalysis });
    let detail: AnalysisDetail;
    while (true) {
      detail = await engine.getAnalysisDetail(local.id);
      await update(client, analysisId, { progress: detail.analysis.progress, current_message: detail.analysis.currentMessage || "분석 중입니다." });
      if (terminal.has(detail.analysis.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    await checkCancelled(client, analysisId);
    const localAnalysisId = detail.analysis.id;
    detail = externalizeAnalysisId(detail, analysisId);
    await persistDetail(client, job.user_id, analysisId, detail, localAnalysisId);
    const finished = detail.analysis.status === "failed" ? "failed" : detail.analysis.status;
    const processStage = detail.analysis.status === "failed" ? "failed" : "scenario_review";
    const currentMessage = detail.analysis.status === "failed" ? "2단계 페이지 분석에 실패했습니다." : "2단계가 완료되었습니다. 시나리오를 검토하고 테스트 실행을 확정해 주세요.";
    await update(client, analysisId, { status: finished, process_stage: processStage, progress: 100, current_message: currentMessage, summary: detail.analysis.summary || null, error: detail.analysis.error || null, completed_at: new Date().toISOString() });
    if (workflow.data?.id) await client.from("workflow_runs").update({ status: finished, completed_at: new Date().toISOString() }).eq("id", workflow.data.id);
    if (detail.analysis.status === "failed") throw new Error(detail.analysis.error?.message || "QA analysis failed");
  } catch (cause) {
    if (cause instanceof Error && cause.message === "ANALYSIS_CANCELLED") return;
    const message = cause instanceof Error ? cause.message : String(cause);
    await update(client, analysisId, { status: "failed", progress: 100, current_message: "분석 실행에 실패했습니다.", error: { code: "RUNNER_FAILED", message }, completed_at: new Date().toISOString() }).catch(() => undefined);
    if (workflow.data?.id) await client.from("workflow_runs").update({ status: "failed", completed_at: new Date().toISOString(), payload: { error: message } }).eq("id", workflow.data.id);
    throw cause;
  }
}

async function prepareRequirementDocument(client: SupabaseClient, analysisId: string): Promise<RequirementDocumentAnalysis | undefined> {
  const { data: row, error } = await client.from("requirement_documents").select("*").eq("analysis_id", analysisId).maybeSingle();
  if (error) throw error;
  if (!row || row.status === "ignored") return undefined;
  await update(client, analysisId, { process_stage: "document_analysis", current_message: "1단계 요구사항 PDF를 분석하고 있습니다." });
  await client.from("requirement_documents").update({ status: "processing" }).eq("id", row.id);
  try {
    const { data, error: downloadError } = await client.storage.from("qa-requirements").download(row.storage_path);
    if (downloadError || !data) throw downloadError || new Error("Requirement document download failed");
    const { analyzeRequirementDocument } = await import("../../server/analysis/services/requirement-document.service");
    const result = await analyzeRequirementDocument(new Uint8Array(await data.arrayBuffer()), row.file_name);
    const { error: updateError } = await client.from("requirement_documents").update({ status: "completed", payload: result, error: null }).eq("id", row.id);
    if (updateError) throw updateError;
    return result;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const documentError = { code: "DOCUMENT_ANALYSIS_FAILED", message };
    await client.from("requirement_documents").update({ status: "failed", error: documentError }).eq("id", row.id);
    await update(client, analysisId, { process_stage: "document_failed", current_message: "PDF 분석에 실패했습니다. 문서를 다시 등록하거나 문서 없이 계속해 주세요.", error: documentError });
    throw cause;
  }
}

function externalizeAnalysisId(source: AnalysisDetail, analysisId: string): AnalysisDetail {
  const detail = structuredClone(source); detail.analysis.id = analysisId;
  if (detail.snapshot) detail.snapshot.analysisId = analysisId;
  if (detail.pageAnalysis) detail.pageAnalysis.analysisId = analysisId;
  for (const test of detail.generatedTests) test.analysisId = analysisId;
  for (const run of detail.testRuns) run.analysisId = analysisId;
  for (const item of detail.pages) {
    item.page.analysisId = analysisId;
    if (item.snapshot) item.snapshot.analysisId = analysisId;
    if (item.pageAnalysis) item.pageAnalysis.analysisId = analysisId;
    for (const test of item.generatedTests) test.analysisId = analysisId;
    for (const run of item.testRuns) run.analysisId = analysisId;
  }
  if (detail.siteMap) detail.siteMap.analysisId = analysisId;
  if (detail.siteAnalysis) detail.siteAnalysis.analysisId = analysisId;
  return detail;
}

async function persistDetail(client: SupabaseClient, userId: string, analysisId: string, detail: AnalysisDetail, localAnalysisId: string): Promise<void> {
  const pageIds = new Map<string, string>();
  for (const item of detail.pages) {
    const { data, error } = await client.from("analysis_pages").insert({ analysis_id: analysisId, user_id: userId, source_id: item.page.id, requested_url: item.page.requestedUrl, final_url: item.page.finalUrl, title: item.page.title, depth: item.page.depth, status: item.page.status, http_status: item.page.httpStatus, content_type: item.page.contentType, payload: item }).select("id").single();
    if (error) throw error; pageIds.set(item.page.id, data.id);
    if (item.snapshot) await client.from("page_snapshots").insert({ analysis_id: analysisId, page_id: data.id, user_id: userId, source_id: item.snapshot.id, payload: item.snapshot });
    for (const fn of item.pageAnalysis?.primaryFunctions || []) await client.from("page_functions").insert({ analysis_id: analysisId, page_id: data.id, user_id: userId, source_id: fn.id, name: fn.name, description: fn.description, payload: fn });
    await persistIssues(client, userId, analysisId, data.id, item);
  }
  if (detail.snapshot) await client.from("page_snapshots").insert({ analysis_id: analysisId, user_id: userId, source_id: detail.snapshot.id, payload: detail.snapshot });
  const testIds = new Map<string, string>();
  for (const test of detail.generatedTests) {
    const { data, error } = await client.from("generated_tests").insert({ analysis_id: analysisId, page_id: test.pageId ? pageIds.get(test.pageId) : null, user_id: userId, source_id: test.id, title: test.title, safety_level: test.safetyLevel, auto_executable: test.autoExecutable, payload: test }).select("id").single();
    if (error) throw error; testIds.set(test.id, data.id);
    if (test.steps.length) { const { error: stepError } = await client.from("generated_test_steps").insert(test.steps.map((step) => ({ test_id: data.id, analysis_id: analysisId, user_id: userId, step_order: step.order, action: step.action, payload: step }))); if (stepError) throw stepError; }
  }
  for (const run of detail.testRuns) {
    const { data, error } = await client.from("test_runs").insert({ analysis_id: analysisId, test_id: testIds.get(run.scenarioId) || null, user_id: userId, source_id: run.id, status: run.status, duration_ms: run.durationMs, payload: run }).select("id").single();
    if (error) throw error;
    if (run.stepResults.length) { const { error: resultError } = await client.from("test_step_results").insert(run.stepResults.map((result) => ({ run_id: data.id, analysis_id: analysisId, user_id: userId, step_order: result.order, status: result.status, payload: result }))); if (resultError) throw resultError; }
  }
  await client.from("analysis_summaries").upsert({ analysis_id: analysisId, user_id: userId, payload: { ...detail, generatedTests: [], testRuns: [], pages: [] } });
  await uploadArtifacts(client, userId, analysisId, localAnalysisId, detail);
}

async function persistIssues(client: SupabaseClient, userId: string, analysisId: string, pageId: string, item: AnalysisDetail["pages"][number]) {
  const values: any[] = [];
  for (const issue of item.snapshot?.consoleMessages || []) values.push({ kind: "console", severity: issue.type === "warning" ? "warning" : "error", title: issue.text.slice(0, 240), payload: issue });
  for (const issue of item.snapshot?.networkIssues || []) values.push({ kind: "network", severity: (issue.status || 0) >= 500 ? "error" : "warning", title: `${issue.method} ${issue.url}`.slice(0, 240), payload: issue });
  for (const issue of item.pageAnalysis?.risks || []) values.push({ kind: "risk", severity: issue.severity, title: issue.title, payload: issue });
  if (values.length) await client.from("analysis_issues").insert(values.map((value) => ({ ...value, analysis_id: analysisId, page_id: pageId, user_id: userId })));
}

async function uploadArtifacts(client: SupabaseClient, userId: string, analysisId: string, localAnalysisId: string, detail: AnalysisDetail) {
  const sourceIds = new Set<string>();
  if (detail.snapshot?.screenshotArtifactId) sourceIds.add(detail.snapshot.screenshotArtifactId);
  for (const page of detail.pages) if (page.snapshot?.screenshotArtifactId) sourceIds.add(page.snapshot.screenshotArtifactId);
  for (const run of detail.testRuns) { for (const id of run.screenshotArtifactIds) sourceIds.add(id); for (const step of run.stepResults) if (step.screenshotArtifactId) sourceIds.add(step.screenshotArtifactId); }
  const { readArtifact } = await import("../../server/storage/artifact-store");
  for (const sourceId of sourceIds) {
    const local = await readArtifact(localAnalysisId, sourceId); if (!local) continue;
    const storagePath = `${userId}/${analysisId}/${sourceId}.png`;
    const { error } = await client.storage.from("qa-artifacts").upload(storagePath, local.bytes, { contentType: "image/png", upsert: false }); if (error) throw error;
    await client.from("artifacts").insert({ analysis_id: analysisId, user_id: userId, source_id: sourceId, storage_path: storagePath, content_type: "image/png", size_bytes: local.bytes.length });
  }
}
