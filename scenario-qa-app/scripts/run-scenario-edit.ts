import { createClient } from "@supabase/supabase-js";
import type { GeneratedTestScenario, PageSnapshot } from "../shared/types/analysis";
import { generateNaturalLanguageScenarioDraft } from "../server/services/natural-language-scenario-editor.service";
import { uuidArg } from "./uuid-args";

const args = process.argv.slice(2);
const analysisId = uuidArg(args, "analysis-id");
const testId = uuidArg(args, "test-id");
const requestId = uuidArg(args, "request-id");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase service credentials are required");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function run() {
  const { data: testRow, error: testError } = await client.from("generated_tests").select("id,page_id,payload").eq("id", testId).eq("analysis_id", analysisId).single();
  if (testError || !testRow) throw new Error("Scenario edit target was not found");
  const scenario = testRow.payload as GeneratedTestScenario & { aiEdit?: { requestId: string; status: string; instruction: string; requestedAt: string } };
  if (scenario.aiEdit?.requestId !== requestId || scenario.aiEdit.status !== "pending") throw new Error("Scenario edit request is no longer active");

  let snapshotQuery = client.from("page_snapshots").select("payload").eq("analysis_id", analysisId).order("created_at", { ascending: false }).limit(1);
  snapshotQuery = testRow.page_id ? snapshotQuery.eq("page_id", testRow.page_id) : snapshotQuery.is("page_id", null);
  const { data: snapshotRows, error: snapshotError } = await snapshotQuery;
  const snapshot = snapshotRows?.[0]?.payload as PageSnapshot | undefined;
  if (snapshotError || !snapshot) throw new Error("Scenario snapshot was not found");

  try {
    const result = await generateNaturalLanguageScenarioDraft(scenario, snapshot, scenario.aiEdit.instruction);
    const { data: latest } = await client.from("generated_tests").select("payload").eq("id", testId).single();
    const latestPayload = latest?.payload as typeof scenario | undefined;
    if (latestPayload?.aiEdit?.requestId !== requestId) return;
    const { error } = await client.from("generated_tests").update({ payload: { ...latestPayload, aiEdit: { ...latestPayload.aiEdit, status: "completed", ...result, completedAt: new Date().toISOString() } } }).eq("id", testId);
    if (error) throw new Error("Scenario edit result could not be saved");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "AI 수정안을 만들지 못했습니다.";
    const { data: latest } = await client.from("generated_tests").select("payload").eq("id", testId).single();
    const latestPayload = latest?.payload as typeof scenario | undefined;
    if (latestPayload?.aiEdit?.requestId === requestId) {
      await client.from("generated_tests").update({ payload: { ...latestPayload, aiEdit: { ...latestPayload.aiEdit, status: "failed", error: message, completedAt: new Date().toISOString() } } }).eq("id", testId);
    }
    throw cause;
  }
}

run().catch((error) => { console.error(error instanceof Error ? error.message : "Scenario edit runner failed"); process.exitCode = 1; });
