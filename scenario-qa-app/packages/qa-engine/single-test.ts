import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AutomatedTestRun, GeneratedTestScenario, PageSnapshot } from "../../shared/types/analysis";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function runSingleTest(analysisId: string, testId: string, testRunId: string): Promise<void> {
  const client = adminClient();
  const [{ data: analysis }, { data: testRow }, { data: runRow }] = await Promise.all([
    client.from("analyses").select("id,user_id").eq("id", analysisId).single(),
    client.from("generated_tests").select("*").eq("id", testId).eq("analysis_id", analysisId).single(),
    client.from("test_runs").select("*").eq("id", testRunId).eq("analysis_id", analysisId).eq("test_id", testId).single()
  ]);
  if (!analysis || !testRow || !runRow || analysis.user_id !== testRow.user_id || analysis.user_id !== runRow.user_id) {
    throw new Error("Single test job was not found or does not belong to the analysis");
  }

  let snapshotQuery = client.from("page_snapshots").select("payload").eq("analysis_id", analysisId).order("created_at", { ascending: false }).limit(1);
  snapshotQuery = testRow.page_id ? snapshotQuery.eq("page_id", testRow.page_id) : snapshotQuery.is("page_id", null);
  const { data: snapshotRows } = await snapshotQuery;
  const snapshot = snapshotRows?.[0]?.payload as PageSnapshot | undefined;
  if (!snapshot) throw new Error("Page snapshot was not found");

  const scenario = testRow.payload as GeneratedTestScenario;
  const queued = runRow.payload as AutomatedTestRun;
  const workRoot = path.resolve(process.cwd(), ".qa-runs", analysisId, testRunId);
  await mkdir(workRoot, { recursive: true });
  process.env.NUXT_STORAGE_ROOT = workRoot;
  const startedAt = new Date().toISOString();
  await updateRun(client, testRunId, { ...queued, status: "running", startedAt }, "running");

  try {
    const { executeGeneratedTests } = await import("../../server/playwright/test-executor");
    const [executed] = await executeGeneratedTests(snapshot, [scenario]);
    if (!executed) throw new Error("Test executor returned no result");
    const completed: AutomatedTestRun = {
      ...executed, id: queued.id, analysisId, trigger: "manual_rerun",
      scenarioRevision: scenario.revision || 1, scenarioSnapshot: structuredClone(scenario)
    };
    await uploadArtifacts(client, analysis.user_id, analysisId, completed);
    await updateRun(client, testRunId, completed, completed.status, completed.durationMs);
    if (completed.stepResults.length) {
      const { error } = await client.from("test_step_results").insert(completed.stepResults.map((result) => ({
        run_id: testRunId, analysis_id: analysisId, user_id: analysis.user_id,
        step_order: result.order, status: result.status, payload: result
      })));
      if (error) throw error;
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const failed: AutomatedTestRun = {
      ...queued, status: "error", startedAt, completedAt: new Date().toISOString(),
      error: { code: "TEST_RERUN_FAILED", message }
    };
    await updateRun(client, testRunId, failed, "error").catch(() => undefined);
    throw cause;
  }
}

async function updateRun(client: SupabaseClient, id: string, payload: AutomatedTestRun, status: string, durationMs?: number) {
  const { error } = await client.from("test_runs").update({ status, duration_ms: durationMs || null, payload }).eq("id", id);
  if (error) throw error;
}

async function uploadArtifacts(client: SupabaseClient, userId: string, analysisId: string, run: AutomatedTestRun) {
  const sourceIds = new Set(run.screenshotArtifactIds);
  for (const step of run.stepResults) if (step.screenshotArtifactId) sourceIds.add(step.screenshotArtifactId);
  const { readArtifact } = await import("../../server/storage/artifact-store");
  for (const sourceId of sourceIds) {
    const local = await readArtifact(analysisId, sourceId);
    if (!local) continue;
    const storagePath = `${userId}/${analysisId}/${sourceId}.png`;
    const { error: uploadError } = await client.storage.from("qa-artifacts").upload(storagePath, local.bytes, { contentType: "image/png", upsert: false });
    if (uploadError) throw uploadError;
    const { error: rowError } = await client.from("artifacts").insert({
      analysis_id: analysisId, user_id: userId, source_id: sourceId,
      storage_path: storagePath, content_type: "image/png", size_bytes: local.bytes.length
    });
    if (rowError) throw rowError;
  }
}
