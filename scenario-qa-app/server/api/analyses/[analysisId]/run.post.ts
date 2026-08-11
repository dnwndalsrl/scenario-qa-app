import type { AutomatedTestRun, GeneratedTestScenario } from "../../../../shared/types/analysis";
import { getOwnedAnalysis } from "../../../services/analysis-records.service";
import { dispatchApprovedTestsWorkflow, githubConfigFromRuntime } from "../../../services/github-actions.service";
import { createServiceSupabaseClient, requireUser } from "../../../services/supabase.service";
import { createId } from "../../../utils/id";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  if (analysis.process_stage !== "scenario_review") throw createError({ statusCode: 409, statusMessage: "시나리오 검토 단계에서만 전체 테스트를 확정할 수 있습니다." });
  const admin = createServiceSupabaseClient(event);
  const { data: rows, error } = await admin.from("generated_tests").select("*").eq("analysis_id", analysisId).eq("safety_level", "safe").eq("auto_executable", true).order("created_at");
  if (error) throw createError({ statusCode: 500, statusMessage: "실행할 시나리오를 조회하지 못했습니다." });
  if (!rows?.length) throw createError({ statusCode: 409, statusMessage: "실행 가능한 안전한 시나리오가 없습니다." });
  const { data: active } = await admin.from("test_runs").select("id").eq("analysis_id", analysisId).in("status", ["pending", "running"]).limit(1);
  if (active?.length) throw createError({ statusCode: 409, statusMessage: "이미 실행 중인 테스트가 있습니다." });

  const values = rows.map((row) => {
    const scenario = row.payload as GeneratedTestScenario;
    const run: AutomatedTestRun = {
      id: createId("run"), analysisId, pageId: scenario.pageId, scenarioId: scenario.id, status: "pending",
      stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: [], trigger: "approved_run",
      scenarioRevision: scenario.revision || 1, scenarioSnapshot: structuredClone(scenario)
    };
    return { analysis_id: analysisId, test_id: row.id, user_id: analysis.user_id, source_id: run.id, status: "pending", payload: run };
  });
  const { error: insertError } = await admin.from("test_runs").insert(values);
  if (insertError) throw createError({ statusCode: 500, statusMessage: "테스트 실행 기록을 만들지 못했습니다." });
  const approvedAt = new Date().toISOString();
  await admin.from("analyses").update({ status: "dispatching", process_stage: "test_execution", progress: 85, current_message: "3단계 테스트 실행을 요청하고 있습니다.", scenarios_approved_at: approvedAt, completed_at: null, error: null }).eq("id", analysisId);
  try {
    await dispatchApprovedTestsWorkflow(analysisId, githubConfigFromRuntime(useRuntimeConfig(event)));
    await admin.from("analyses").update({ status: "dispatched", current_message: "3단계 확정 시나리오 실행 대기 중입니다." }).eq("id", analysisId);
  } catch {
    const failed = { code: "WORKFLOW_DISPATCH_FAILED", message: "GitHub Actions 실행 요청에 실패했습니다." };
    await admin.from("test_runs").update({ status: "error" }).eq("analysis_id", analysisId).eq("status", "pending");
    await admin.from("analyses").update({ status: "dispatch_failed", process_stage: "failed", progress: 100, error: failed }).eq("id", analysisId);
    throw createError({ statusCode: 502, statusMessage: failed.message });
  }
  setResponseStatus(event, 202);
  return { status: "dispatched", runCount: values.length };
});
