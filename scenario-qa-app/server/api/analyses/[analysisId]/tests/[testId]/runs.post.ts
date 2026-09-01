import type { AutomatedTestRun, GeneratedTestScenario, PageSnapshot } from "../../../../../../shared/types/analysis";
import { ensureScenarioAssertions } from "../../../../../analysis/services/scenario-verification.service";
import { getOwnedAnalysis } from "../../../../../services/analysis-records.service";
import { getGeneratedTestRow } from "../../../../../services/generated-test-record.service";
import { githubConfigFromRuntime } from "../../../../../services/github-actions.service";
import { requireUser } from "../../../../../services/supabase.service";
import { attemptTestRunDispatch, initialDispatchState } from "../../../../../services/test-dispatch-queue.service";
import { createId } from "../../../../../utils/id";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const testId = getRouterParam(event, "testId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  if (!["completed", "partially_completed", "failed"].includes(analysis.status)) {
    throw createError({ statusCode: 409, statusMessage: "분석이 끝난 뒤 개별 테스트를 실행할 수 있습니다." });
  }

  const admin = client;
  const testRow = await getGeneratedTestRow(admin, analysisId, testId);
  let snapshotQuery = admin.from("page_snapshots").select("payload").eq("analysis_id", analysisId).order("created_at", { ascending: false }).limit(1);
  snapshotQuery = testRow.page_id ? snapshotQuery.eq("page_id", testRow.page_id) : snapshotQuery.is("page_id", null);
  const { data: snapshotRows, error: snapshotError } = await snapshotQuery;
  const snapshot = snapshotRows?.[0]?.payload as PageSnapshot | undefined;
  if (snapshotError || !snapshot) throw createError({ statusCode: 409, statusMessage: "테스트 대상 페이지 스냅샷을 찾을 수 없습니다." });
  const scenario = ensureScenarioAssertions(testRow.payload as GeneratedTestScenario, snapshot);
  if (scenario.safetyLevel !== "safe" || !scenario.autoExecutable) {
    throw createError({ statusCode: 409, statusMessage: "안전 판정을 받은 읽기 전용 테스트만 개별 실행할 수 있습니다." });
  }
  const { data: activeRuns, error: activeError } = await admin.from("test_runs").select("id").eq("test_id", testRow.id).in("status", ["pending", "running"]).limit(1);
  if (activeError) throw createError({ statusCode: 500, statusMessage: "개별 테스트 실행 상태를 확인하지 못했습니다." });
  if (activeRuns?.length) throw createError({ statusCode: 409, statusMessage: "이 테스트는 이미 실행 중입니다." });

  const sourceId = createId("run");
  const queuedAt = new Date().toISOString();
  const queued: AutomatedTestRun = {
    id: sourceId, analysisId, pageId: scenario.pageId, scenarioId: scenario.id,
    status: "pending", stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: [],
    trigger: "manual_rerun", scenarioRevision: scenario.revision || 1, scenarioSnapshot: structuredClone(scenario),
    queuedAt, dispatch: initialDispatchState(queuedAt)
  };
  const { data: runRow, error: runError } = await admin.from("test_runs").insert({
    analysis_id: analysisId, test_id: testRow.id, user_id: analysis.user_id,
    source_id: sourceId, status: "pending", payload: queued
  }).select("id").single();
  if (runError || !runRow) throw createError({ statusCode: 500, statusMessage: "개별 테스트 실행 기록을 만들지 못했습니다." });

  const dispatchStatus = await attemptTestRunDispatch(admin, {
    id: runRow.id, analysis_id: analysisId, test_id: testRow.id, payload: queued
  }, githubConfigFromRuntime(useRuntimeConfig(event)));

  setResponseStatus(event, 202);
  return { runId: sourceId, status: "pending", dispatchStatus };
});
