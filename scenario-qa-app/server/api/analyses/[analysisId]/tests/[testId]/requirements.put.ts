import type { GeneratedTestScenario, RequirementDocumentAnalysis } from "../../../../../../shared/types/analysis";
import { getOwnedAnalysis } from "../../../../../services/analysis-records.service";
import { getGeneratedTestRow } from "../../../../../services/generated-test-record.service";
import { applyScenarioRequirementLinks, scenarioRequirementLinksSchema } from "../../../../../services/scenario-requirement-links.service";
import { requireUser } from "../../../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const testId = getRouterParam(event, "testId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  if (!["completed", "partially_completed", "failed"].includes(analysis.status)) throw createError({ statusCode: 409, statusMessage: "분석이 끝난 뒤 요구사항 연결을 수정할 수 있습니다." });
  const parsed = scenarioRequirementLinksSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "요구사항 연결 입력값을 확인해 주세요." });

  const [testRow, documentResult] = await Promise.all([
    getGeneratedTestRow(client, analysisId, testId),
    client.from("requirement_documents").select("payload,status").eq("analysis_id", analysisId).maybeSingle()
  ]);
  const document = documentResult.data?.payload as RequirementDocumentAnalysis | undefined;
  if (documentResult.error || !document || documentResult.data?.status !== "completed") throw createError({ statusCode: 409, statusMessage: "분석이 완료된 요구사항 문서를 찾을 수 없습니다." });

  let test: GeneratedTestScenario;
  try {
    test = applyScenarioRequirementLinks(testRow.payload as GeneratedTestScenario, document.requirements.map((item) => item.id), parsed.data.requirementIds);
  } catch (cause) {
    throw createError({ statusCode: 400, statusMessage: cause instanceof Error ? cause.message : "요구사항 연결을 저장하지 못했습니다." });
  }
  const { error } = await client.from("generated_tests").update({ payload: test }).eq("id", testRow.id);
  if (error) throw createError({ statusCode: 500, statusMessage: "요구사항 연결을 저장하지 못했습니다." });
  return { test };
});
