import type { AutomatedTestRun, GeneratedTestScenario, PageSnapshot } from "../../../../../../shared/types/analysis";
import { retryableSuiteScenarioIds } from "../../../../../../shared/utils/test-suite-summary";
import { ensureScenarioAssertions } from "../../../../../analysis/services/scenario-verification.service";
import { getOwnedAnalysis } from "../../../../../services/analysis-records.service";
import { githubConfigFromRuntime } from "../../../../../services/github-actions.service";
import { requireUser } from "../../../../../services/supabase.service";
import { attemptTestRunDispatch, initialDispatchState } from "../../../../../services/test-dispatch-queue.service";
import { createId } from "../../../../../utils/id";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const suiteId = getRouterParam(event, "suiteId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  if (analysis.status !== "completed" || analysis.process_stage !== "report_complete") {
    throw createError({ statusCode: 409, statusMessage: "최종 보고서가 완성된 뒤 테스트 스위트를 실행할 수 있습니다." });
  }

  const { data: suite, error: suiteError } = await client.from("test_suites").select("test_ids").eq("id", suiteId).eq("analysis_id", analysisId).maybeSingle();
  if (suiteError) throw createError({ statusCode: 500, statusMessage: "테스트 스위트를 조회하지 못했습니다." });
  if (!suite) throw createError({ statusCode: 404, statusMessage: "테스트 스위트를 찾을 수 없습니다." });
  const testIds = Array.isArray(suite.test_ids) ? suite.test_ids as string[] : [];
  const body = getHeader(event, "content-type") ? await readBody<{ retrySuiteRunId?: string }>(event) : undefined;
  const retrySuiteRunId = typeof body?.retrySuiteRunId === "string" ? body.retrySuiteRunId.trim() : "";
  let selectedTestIds = testIds;
  if (retrySuiteRunId) {
    const { data: previousRows, error: previousError } = await client.from("test_runs").select("payload").eq("analysis_id", analysisId);
    if (previousError) throw createError({ statusCode: 500, statusMessage: "이전 스위트 실행 결과를 조회하지 못했습니다." });
    selectedTestIds = retryableSuiteScenarioIds(suiteId, retrySuiteRunId, testIds, (previousRows || []).map((row) => row.payload as AutomatedTestRun));
    if (!selectedTestIds.length) throw createError({ statusCode: 409, statusMessage: "다시 실행할 실패·오류 테스트가 없습니다." });
  }

  const [{ data: rows, error: testError }, { data: snapshotRows, error: snapshotError }, { data: active, error: activeError }] = await Promise.all([
    client.from("generated_tests").select("*").eq("analysis_id", analysisId).in("source_id", selectedTestIds),
    client.from("page_snapshots").select("page_id,payload").eq("analysis_id", analysisId),
    client.from("test_runs").select("id").eq("analysis_id", analysisId).in("status", ["pending", "running"]).limit(1)
  ]);
  if (testError || rows?.length !== selectedTestIds.length) throw createError({ statusCode: 409, statusMessage: "스위트에 포함된 시나리오를 모두 찾을 수 없습니다." });
  if (snapshotError || !snapshotRows?.length) throw createError({ statusCode: 409, statusMessage: "테스트 대상 페이지 스냅샷을 찾을 수 없습니다." });
  if (activeError) throw createError({ statusCode: 500, statusMessage: "테스트 실행 상태를 확인하지 못했습니다." });
  if (active?.length) throw createError({ statusCode: 409, statusMessage: "이미 실행 중인 테스트가 있습니다." });

  const scenarios = rows.map((row) => {
    const stored = row.payload as GeneratedTestScenario;
    const snapshot = snapshotRows.find((item) => item.page_id === (stored.pageId || null))?.payload as PageSnapshot | undefined;
    if (!snapshot) throw createError({ statusCode: 409, statusMessage: "시나리오의 테스트 대상 페이지 스냅샷을 찾을 수 없습니다." });
    return { row, scenario: ensureScenarioAssertions(stored, snapshot) };
  });
  if (scenarios.some(({ scenario }) => scenario.safetyLevel !== "safe" || !scenario.autoExecutable)) {
    throw createError({ statusCode: 409, statusMessage: "스위트에 자동 실행할 수 없는 시나리오가 포함되어 있습니다." });
  }

  const suiteRunId = createId("suite-run");
  const queuedAt = new Date().toISOString();
  const values = scenarios.map(({ row, scenario }) => {
    const run: AutomatedTestRun = {
      id: createId("run"), analysisId, pageId: scenario.pageId, scenarioId: scenario.id, status: "pending",
      stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: [], trigger: "suite_run",
      scenarioRevision: scenario.revision || 1, scenarioSnapshot: structuredClone(scenario),
      suiteId, suiteRunId, retryOfSuiteRunId: retrySuiteRunId || undefined, queuedAt,
      dispatch: initialDispatchState(queuedAt)
    };
    return { analysis_id: analysisId, test_id: row.id, user_id: analysis.user_id, source_id: run.id, status: "pending", payload: run };
  });
  const { data: runRows, error: insertError } = await client.from("test_runs").insert(values).select("id,test_id,source_id");
  if (insertError || runRows?.length !== values.length) throw createError({ statusCode: 500, statusMessage: "스위트 실행 기록을 만들지 못했습니다." });

  const config = githubConfigFromRuntime(useRuntimeConfig(event));
  const dispatchResults = await Promise.all(runRows.map((row) => {
    const value = values.find((item) => item.source_id === row.source_id)!;
    return attemptTestRunDispatch(client, { id: row.id, analysis_id: analysisId, test_id: row.test_id, payload: value.payload }, config);
  }));
  const retryingCount = dispatchResults.filter((status) => status === "retrying").length;

  setResponseStatus(event, 202);
  return {
    status: retryingCount === values.length ? "queued_for_retry" : retryingCount ? "partially_dispatched" : "dispatched",
    suiteRunId, runIds: values.map((value) => value.source_id), retryingCount, retriedCount: retrySuiteRunId ? values.length : 0
  };
});
