import { randomUUID } from "node:crypto";
import type { GeneratedTestScenario } from "../../../../../../shared/types/analysis";
import { getOwnedAnalysis } from "../../../../../services/analysis-records.service";
import { getGeneratedTestRow } from "../../../../../services/generated-test-record.service";
import { dispatchScenarioEditWorkflow, githubConfigFromRuntime } from "../../../../../services/github-actions.service";
import { naturalLanguageScenarioRequestSchema } from "../../../../../services/natural-language-scenario-editor.service";
import { requireUser } from "../../../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const testId = getRouterParam(event, "testId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  if (!["completed", "partially_completed", "failed"].includes(analysis.status)) {
    throw createError({ statusCode: 409, statusMessage: "분석이 끝난 뒤 AI 수정안을 만들 수 있습니다." });
  }

  const parsed = naturalLanguageScenarioRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "수정 요청을 3자 이상 입력해 주세요." });
  const testRow = await getGeneratedTestRow(client, analysisId, testId);

  const requestId = randomUUID();
  const scenario = testRow.payload as GeneratedTestScenario & { aiEdit?: Record<string, unknown> };
  const aiEdit = { requestId, status: "pending", instruction: parsed.data.instruction, requestedAt: new Date().toISOString() };
  const { error: updateError } = await client.from("generated_tests").update({ payload: { ...scenario, aiEdit } }).eq("id", testRow.id);
  if (updateError) throw createError({ statusCode: 500, statusMessage: "AI 수정 요청을 저장하지 못했습니다." });

  try {
    await dispatchScenarioEditWorkflow(analysisId, testRow.id, requestId, githubConfigFromRuntime(useRuntimeConfig(event)));
  } catch (cause) {
    await client.from("generated_tests").update({ payload: { ...scenario, aiEdit: { ...aiEdit, status: "failed", error: "AI 수정 실행기를 시작하지 못했습니다." } } }).eq("id", testRow.id);
    throw createError({ statusCode: 502, statusMessage: "AI 수정 실행기를 시작하지 못했습니다.", cause });
  }

  setResponseStatus(event, 202);
  return { requestId, status: "pending" };
});
