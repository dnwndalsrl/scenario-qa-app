import { createClient } from "@supabase/supabase-js";
import type { AutomatedTestRun } from "../shared/types/analysis";
import { uuidArg } from "./uuid-args";

const args = process.argv.slice(2);
const testRunId = uuidArg(args, "test-run-id");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase runner secrets are required");

const client = createClient(url, key, { auth: { persistSession: false } });
const { data } = await client.from("test_runs").select("payload").eq("id", testRunId).maybeSingle();
if (!data) throw new Error(`Test run ${testRunId} was not found`);
const now = new Date().toISOString();
const payload: AutomatedTestRun = {
  ...(data.payload as AutomatedTestRun), status: "error", completedAt: now,
  error: { code: "WORKFLOW_FAILED", message: "GitHub Actions 실행이 중단되었습니다. 워크플로 로그를 확인해 주세요." }
};
const { error } = await client.from("test_runs").update({ status: "error", payload }).eq("id", testRunId).in("status", ["pending", "running"]);
if (error) throw error;
