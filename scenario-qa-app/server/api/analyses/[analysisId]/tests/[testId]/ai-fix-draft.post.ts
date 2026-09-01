import { randomUUID } from "node:crypto";
import type { AutomatedTestRun, GeneratedTestScenario } from "../../../../../../shared/types/analysis";
import { getOwnedAnalysis } from "../../../../../services/analysis-records.service";
import { buildFailureFixContext } from "../../../../../services/failed-test-scenario-fix.service";
import { getGeneratedTestRow } from "../../../../../services/generated-test-record.service";
import { dispatchScenarioEditWorkflow, githubConfigFromRuntime } from "../../../../../services/github-actions.service";
import { requireUser } from "../../../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const testId = getRouterParam(event, "testId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  if (!["completed", "partially_completed", "failed"].includes(analysis.status)) {
    throw createError({ statusCode: 409, statusMessage: "분석이 끝난 뒤 실패 원인 수정안을 만들 수 있습니다." });
  }
  const testRow = await getGeneratedTestRow(client, analysisId, testId);
  const { data: runRows, error: runError } = await client.from("test_runs").select("payload").eq("analysis_id", analysisId).eq("test_id", testRow.id).in("status", ["failed", "error", "blocked"]).order("created_at", { ascending: false }).limit(1);
  const run = runRows?.[0]?.payload as AutomatedTestRun | undefined;
  if (runError) throw createError({ statusCode: 500, statusMessage: "실패 실행 근거를 조회하지 못했습니다." });
  if (!run) throw createError({ statusCode: 409, statusMessage: "실패한 최근 실행이 있어야 수정안을 만들 수 있습니다." });

  const requestId = randomUUID();
  const scenario = testRow.payload as GeneratedTestScenario & { aiEdit?: Record<string, unknown> };
  const aiEdit = {
    requestId, status: "pending", kind: "failure_fix",
    instruction: "실패 실행 근거를 분석하고, 기존 의도를 유지하면서 재현 가능한 실행 단계와 예상 결과 검증을 최소한으로 수정해 주세요.",
    failureContext: buildFailureFixContext(run), requestedAt: new Date().toISOString()
  };
  const { error: updateError } = await client.from("generated_tests").update({ payload: { ...scenario, aiEdit } }).eq("id", testRow.id);
  if (updateError) throw createError({ statusCode: 500, statusMessage: "실패 원인 수정 요청을 저장하지 못했습니다." });

  try {
    await dispatchScenarioEditWorkflow(analysisId, testRow.id, requestId, githubConfigFromRuntime(useRuntimeConfig(event)));
  } catch (cause) {
    await client.from("generated_tests").update({ payload: { ...scenario, aiEdit: { ...aiEdit, status: "failed", error: "AI 수정 실행기를 시작하지 못했습니다." } } }).eq("id", testRow.id);
    throw createError({ statusCode: 502, statusMessage: "AI 수정 실행기를 시작하지 못했습니다.", cause });
  }
  setResponseStatus(event, 202);
  return { requestId, status: "pending" };
});
