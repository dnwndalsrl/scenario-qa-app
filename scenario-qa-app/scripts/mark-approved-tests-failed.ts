import { createClient } from "@supabase/supabase-js";
import type { AutomatedTestRun } from "../shared/types/analysis";
import { analysisIdFromArgs } from "./analysis-id";

const analysisId = analysisIdFromArgs(process.argv.slice(2));
const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase runner secrets are required");
const client = createClient(url, key, { auth: { persistSession: false } });
const { data: rows } = await client.from("test_runs").select("id,payload").eq("analysis_id", analysisId).in("status", ["pending", "running"]);
for (const row of rows || []) {
  const payload = { ...(row.payload as AutomatedTestRun), status: "error" as const, completedAt: new Date().toISOString(), error: { code: "WORKFLOW_FAILED", message: "GitHub Actions 실행이 중단되었습니다." } };
  await client.from("test_runs").update({ status: "error", payload }).eq("id", row.id);
}
await client.from("analyses").update({ status: "failed", process_stage: "failed", progress: 100, current_message: "3단계 테스트 실행이 중단되었습니다.", error: { code: "WORKFLOW_FAILED", message: "GitHub Actions 로그를 확인해 주세요." }, completed_at: new Date().toISOString() }).eq("id", analysisId);
