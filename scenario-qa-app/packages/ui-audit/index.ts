import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { collectUiAuditPage } from "../../server/playwright/ui-audit-collector";
import { compareUiDesign } from "../../server/playwright/ui-design-comparison";

function env(name:string){ const value=process.env[name]; if(!value) throw new Error(`${name} is required`); return value; }
export async function runUiAudit(auditId:string){
  const client=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:audit,error}=await client.from("ui_audits").select("*").eq("id",auditId).single(); if(error||!audit) throw new Error("UI audit job not found");
  if(audit.status!=="queued") throw new Error(`UI audit is not runnable from status ${audit.status}`);
  await client.from("ui_audits").update({status:"running",current_message:"화면 상태와 UI 측정값을 수집하고 있습니다.",started_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",auditId);
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage(); const result=await collectUiAuditPage(page,audit.normalized_url,{width:audit.viewport_width,height:audit.viewport_height});
    const screenshotCount=result.artifacts.length;
    let comparison: Awaited<ReturnType<typeof compareUiDesign>> | undefined;
    if(audit.has_reference){
      const {data:reference,error:referenceError}=await client.from("ui_design_references").select("storage_path,content_type,width,height").eq("audit_id",auditId).single();
      if(referenceError||!reference) throw new Error("등록된 디자인 원본을 찾지 못했습니다.");
      const {data:referenceFile,error:downloadError}=await client.storage.from("qa-ui-designs").download(reference.storage_path);
      if(downloadError||!referenceFile) throw new Error("디자인 원본을 불러오지 못했습니다.");
      const actual=result.artifacts.find((artifact)=>artifact.state==="initial"); if(!actual) throw new Error("비교할 최초 화면을 찾지 못했습니다.");
      comparison=await compareUiDesign(page,{
        referenceBytes:Buffer.from(await referenceFile.arrayBuffer()),
        referenceContentType:reference.content_type as "image/png"|"image/jpeg",
        referenceWidth:reference.width,
        referenceHeight:reference.height,
        actualBytes:actual.bytes,
        actualWidth:actual.width,
        actualHeight:actual.height
      });
      result.artifacts.push({sourceId:"ui-design-diff",state:"design_diff",width:actual.width,height:actual.height,bytes:comparison.diffBytes});
    }
    for(const artifact of result.artifacts){ const path=`${audit.user_id}/${auditId}/${artifact.sourceId}.png`; const uploaded=await client.storage.from("qa-ui-audit-artifacts").upload(path,artifact.bytes,{contentType:"image/png",upsert:false}); if(uploaded.error) throw uploaded.error; const saved=await client.from("ui_audit_artifacts").insert({audit_id:auditId,user_id:audit.user_id,source_id:artifact.sourceId,state:artifact.state,storage_path:path,width:artifact.width,height:artifact.height,size_bytes:artifact.bytes.length}); if(saved.error) throw saved.error; }
    if(result.issues.length){ const saved=await client.from("ui_audit_issues").insert(result.issues.map((issue)=>({audit_id:auditId,user_id:audit.user_id,rule:issue.rule,severity:issue.severity,title:issue.title,message:issue.message,selector:issue.selector,state:issue.state,artifact_source_id:issue.artifactSourceId,actual:issue.actual}))); if(saved.error) throw saved.error; }
    const summary={issueCount:result.issues.length,highCount:result.issues.filter((item)=>item.severity==="high").length,mediumCount:result.issues.filter((item)=>item.severity==="medium").length,lowCount:result.issues.filter((item)=>item.severity==="low").length,screenshotCount,...(comparison?{comparison:comparison.summary}:{})};
    await client.from("ui_audits").update({status:"completed",current_message:comparison?"규칙 기반 UI 점검과 디자인 비교가 완료되었습니다.":"규칙 기반 UI 점검이 완료되었습니다.",summary,error:null,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",auditId);
  }catch(cause){ const message=cause instanceof Error?cause.message:String(cause); await client.from("ui_audits").update({status:"failed",current_message:"UI 점검 실행에 실패했습니다.",error:{code:"UI_AUDIT_RUNNER_FAILED",message},completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",auditId); throw cause; }
  finally{ await browser.close(); }
}
