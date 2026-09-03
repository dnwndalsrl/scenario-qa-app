import { createClient } from "@supabase/supabase-js";
import { analysisIdFromArgs } from "./analysis-id";
const auditId=analysisIdFromArgs(process.argv.slice(2)); const url=process.env.SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key) throw new Error("Supabase runner credentials are required");
const {error}=await createClient(url,key,{auth:{persistSession:false}}).from("ui_audits").update({status:"failed",current_message:"UI 점검 실행기가 중단되었습니다.",error:{code:"WORKFLOW_FAILED",message:"GitHub Actions 실행 로그를 확인해 주세요."},completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",auditId).in("status",["queued","running"]);
if(error) throw error;
