import type { AutomatedTestRun, GeneratedTestScenario } from "../../../../../../shared/types/analysis";
import { getOwnedAnalysis } from "../../../../../services/analysis-records.service";
import { getGeneratedTestRow } from "../../../../../services/generated-test-record.service";
import { dispatchTestWorkflow, githubConfigFromRuntime } from "../../../../../services/github-actions.service";
import { createServiceSupabaseClient, requireUser } from "../../../../../services/supabase.service";
import { createId } from "../../../../../utils/id";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const testId = getRouterParam(event, "testId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  if (!["completed", "partially_completed", "failed"].includes(analysis.status)) {
    throw createError({ statusCode: 409, statusMessage: "분석이 끝난 뒤 개별 테스트를 실행할 수 있습니다." });
  }

  const admin = createServiceSupabaseClient(event);
  const testRow = await getGeneratedTestRow(admin, analysisId, testId);
  const scenario = testRow.payload as GeneratedTestScenario;
  if (scenario.safetyLevel !== "safe" || !scenario.autoExecutable) {
    throw createError({ statusCode: 409, statusMessage: "안전 판정을 받은 읽기 전용 테스트만 개별 실행할 수 있습니다." });
  }
  const { data: activeRuns, error: activeError } = await admin.from("test_runs").select("id").eq("test_id", testRow.id).in("status", ["pending", "running"]).limit(1);
  if (activeError) throw createError({ statusCode: 500, statusMessage: "개별 테스트 실행 상태를 확인하지 못했습니다." });
  if (activeRuns?.length) throw createError({ statusCode: 409, statusMessage: "이 테스트는 이미 실행 중입니다." });

  const sourceId = createId("run");
  const queued: AutomatedTestRun = {
    id: sourceId, analysisId, pageId: scenario.pageId, scenarioId: scenario.id,
    status: "pending", stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: [],
    trigger: "manual_rerun", scenarioRevision: scenario.revision || 1, scenarioSnapshot: structuredClone(scenario)
  };
  const { data: runRow, error: runError } = await admin.from("test_runs").insert({
    analysis_id: analysisId, test_id: testRow.id, user_id: analysis.user_id,
    source_id: sourceId, status: "pending", payload: queued
  }).select("id").single();
  if (runError || !runRow) throw createError({ statusCode: 500, statusMessage: "개별 테스트 실행 기록을 만들지 못했습니다." });

  try {
    await dispatchTestWorkflow(analysisId, testRow.id, runRow.id, githubConfigFromRuntime(useRuntimeConfig(event)));
  } catch {
    const failed = { ...queued, status: "error" as const, completedAt: new Date().toISOString(), error: { code: "WORKFLOW_DISPATCH_FAILED", message: "GitHub Actions 실행 요청에 실패했습니다." } };
    await admin.from("test_runs").update({ status: "error", payload: failed }).eq("id", runRow.id);
    throw createError({ statusCode: 502, statusMessage: "GitHub Actions 실행 요청에 실패했습니다." });
  }

  setResponseStatus(event, 202);
  return { runId: sourceId, status: "pending" };
});
