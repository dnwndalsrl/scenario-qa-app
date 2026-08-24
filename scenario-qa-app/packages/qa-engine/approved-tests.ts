import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AutomatedTestRun, GeneratedTestScenario, PageSnapshot } from "../../shared/types/analysis";

function env(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
function adminClient() { return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }); }

export async function runApprovedTests(analysisId: string, options: { preserveAnalysisState?: boolean } = {}): Promise<void> {
  const client = adminClient();
  const { data: analysis, error } = await client.from("analyses").select("*").eq("id", analysisId).single();
  if (error || !analysis) throw new Error("Analysis job not found");
  if (options.preserveAnalysisState) {
    if (analysis.status !== "completed" || analysis.process_stage !== "report_complete") throw new Error("Analysis is not ready for suite tests");
  } else if (!["dispatching", "dispatched"].includes(analysis.status) || analysis.process_stage !== "test_execution") {
    throw new Error("Analysis is not ready for approved tests");
  }
  const workRoot = path.resolve(process.cwd(), ".qa-runs", analysisId, "approved");
  await mkdir(workRoot, { recursive: true });
  process.env.NUXT_STORAGE_ROOT = workRoot;
  if (!options.preserveAnalysisState) {
    await client.from("analyses").update({ status: "running", progress: 90, current_message: "3단계 확정 시나리오를 실행하고 있습니다.", started_at: new Date().toISOString() }).eq("id", analysisId);
  }
  const [{ data: testRows }, { data: runRows }] = await Promise.all([
    client.from("generated_tests").select("*").eq("analysis_id", analysisId),
    client.from("test_runs").select("*").eq("analysis_id", analysisId).eq("status", "pending")
  ]);
  if (!testRows?.length || !runRows?.length) throw new Error("Approved test queue is empty");
  const { executeGeneratedTests } = await import("../../server/playwright/test-executor");

  try {
    const pageIds = [...new Set(testRows.filter((test) => runRows.some((run) => run.test_id === test.id)).map((test) => test.page_id || null))];
    for (const pageId of pageIds) {
      let snapshotQuery = client.from("page_snapshots").select("payload").eq("analysis_id", analysisId).order("created_at", { ascending: false }).limit(1);
      snapshotQuery = pageId ? snapshotQuery.eq("page_id", pageId) : snapshotQuery.is("page_id", null);
      const { data: snapshots } = await snapshotQuery;
      const snapshot = snapshots?.[0]?.payload as PageSnapshot | undefined;
      if (!snapshot) throw new Error("Page snapshot was not found");
      const pageTests = testRows.filter((test) => test.page_id === pageId && runRows.some((run) => run.test_id === test.id));
      await client.from("test_runs").update({ status: "running" }).in("id", pageTests.map((test) => runRows.find((run) => run.test_id === test.id)!.id));
      const results = await executeGeneratedTests(snapshot, pageTests.map((test) => test.payload as GeneratedTestScenario));
      for (const result of results) {
        const testRow = pageTests.find((test) => test.source_id === result.scenarioId)!;
        const runRow = runRows.find((run) => run.test_id === testRow.id)!;
        const queued = runRow.payload as AutomatedTestRun;
        const completed: AutomatedTestRun = {
          ...result, id: queued.id, analysisId, trigger: options.preserveAnalysisState ? "suite_run" : "approved_run",
          scenarioRevision: queued.scenarioRevision, scenarioSnapshot: queued.scenarioSnapshot
        };
        await uploadArtifacts(client, analysis.user_id, analysisId, completed);
        const { error: runError } = await client.from("test_runs").update({ status: completed.status, duration_ms: completed.durationMs || null, payload: completed }).eq("id", runRow.id);
        if (runError) throw runError;
        if (completed.stepResults.length) {
          const { error: stepError } = await client.from("test_step_results").insert(completed.stepResults.map((step) => ({ run_id: runRow.id, analysis_id: analysisId, user_id: analysis.user_id, step_order: step.order, status: step.status, payload: step })));
          if (stepError) throw stepError;
        }
      }
    }
    const { data: allRunRows } = await client.from("test_runs").select("payload").eq("analysis_id", analysisId);
    const runs = (allRunRows || []).map((row) => row.payload as AutomatedTestRun);
    const successCount = runs.filter((run) => run.status === "success").length;
    const failedCount = runs.filter((run) => run.status === "failed").length;
    const blockedCount = runs.filter((run) => run.status === "blocked").length;
    const errorCount = runs.filter((run) => run.status === "error").length;
    const summary = { ...(analysis.summary || {}), executedTestCount: runs.length, successCount, failedCount, blockedCount, errorCount, overallStatus: failedCount + errorCount ? "failed" : "passed" };
    if (!options.preserveAnalysisState) {
      await client.from("analyses").update({ status: "completed", process_stage: "report_complete", progress: 100, current_message: "3단계 테스트가 완료되어 최종 보고서를 생성했습니다.", summary, completed_at: new Date().toISOString(), error: null }).eq("id", analysisId);
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const { data: unfinishedRows } = await client.from("test_runs").select("id,payload").eq("analysis_id", analysisId).in("status", ["pending", "running"]);
    for (const row of unfinishedRows || []) {
      const payload = { ...(row.payload as AutomatedTestRun), status: "error" as const, completedAt: new Date().toISOString(), error: { code: "APPROVED_TESTS_FAILED", message } };
      await client.from("test_runs").update({ status: "error", payload }).eq("id", row.id);
    }
    if (!options.preserveAnalysisState) {
      await client.from("analyses").update({ status: "failed", process_stage: "failed", progress: 100, current_message: "3단계 테스트 실행에 실패했습니다.", error: { code: "APPROVED_TESTS_FAILED", message }, completed_at: new Date().toISOString() }).eq("id", analysisId);
    }
    throw cause;
  }
}

async function uploadArtifacts(client: SupabaseClient, userId: string, analysisId: string, run: AutomatedTestRun) {
  const sourceIds = new Set(run.screenshotArtifactIds);
  for (const step of run.stepResults) if (step.screenshotArtifactId) sourceIds.add(step.screenshotArtifactId);
  const { readArtifact } = await import("../../server/storage/artifact-store");
  for (const sourceId of sourceIds) {
    const local = await readArtifact(analysisId, sourceId); if (!local) continue;
    const storagePath = `${userId}/${analysisId}/${sourceId}.png`;
    const { error } = await client.storage.from("qa-artifacts").upload(storagePath, local.bytes, { contentType: "image/png", upsert: false }); if (error) throw error;
    await client.from("artifacts").insert({ analysis_id: analysisId, user_id: userId, source_id: sourceId, storage_path: storagePath, content_type: "image/png", size_bytes: local.bytes.length });
  }
}
