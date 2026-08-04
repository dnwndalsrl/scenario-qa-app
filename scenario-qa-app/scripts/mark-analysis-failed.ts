import { createClient } from "@supabase/supabase-js";
import { analysisIdFromArgs } from "./analysis-id";
const id = analysisIdFromArgs(process.argv.slice(2)); const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase runner secrets are required");
await createClient(url, key, { auth: { persistSession: false } }).from("analyses").update({ status: "failed", progress: 100, current_message: "GitHub Actions 실행이 중단되었습니다.", error: { code: "WORKFLOW_FAILED", message: "워크플로 로그를 확인해 주세요." }, completed_at: new Date().toISOString() }).eq("id", id).in("status", ["queued","dispatching","dispatched","running","cancel_requested"]);
