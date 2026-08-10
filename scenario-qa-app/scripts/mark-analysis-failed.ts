import { createClient } from "@supabase/supabase-js";
import { analysisIdFromArgs } from "./analysis-id";

const id = analysisIdFromArgs(process.argv.slice(2));
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) throw new Error("Supabase runner secrets are required");

const now = new Date().toISOString();
const { data, error } = await createClient(url, key, { auth: { persistSession: false } })
  .from("analyses")
  .update({
    status: "failed",
    progress: 100,
    current_message: "GitHub Actions 실행이 중단되었습니다.",
    error: { code: "WORKFLOW_FAILED", message: "워크플로 로그를 확인해 주세요." },
    completed_at: now,
    updated_at: now
  })
  .eq("id", id)
  .in("status", ["queued", "dispatching", "dispatched", "running", "cancel_requested"])
  .select("id");

if (error) throw new Error(`Failed to mark analysis ${id} as failed: ${error.message}`);
if (!data?.length) {
  throw new Error(
    `Analysis ${id} could not be marked failed because no active row was found. ` +
      "Check the GitHub Actions Supabase repository secrets."
  );
}

console.log(`Marked analysis ${id} as failed.`);
