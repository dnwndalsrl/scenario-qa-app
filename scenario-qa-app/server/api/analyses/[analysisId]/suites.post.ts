import { getOwnedAnalysis } from "../../../services/analysis-records.service";
import { requireUser } from "../../../services/supabase.service";
import { rowToTestSuite, testSuiteInputSchema } from "../../../services/test-suite.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  const parsed = testSuiteInputSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "스위트 이름과 선택한 시나리오를 확인해 주세요." });

  const { data: tests, error: testError } = await client.from("generated_tests")
    .select("source_id,safety_level,auto_executable")
    .eq("analysis_id", analysisId)
    .in("source_id", parsed.data.testIds);
  if (testError) throw createError({ statusCode: 500, statusMessage: "선택한 시나리오를 확인하지 못했습니다." });
  if (tests?.length !== parsed.data.testIds.length) throw createError({ statusCode: 400, statusMessage: "이 분석에 속하지 않은 시나리오가 포함되어 있습니다." });
  if (tests.some((test) => test.safety_level !== "safe" || !test.auto_executable)) {
    throw createError({ statusCode: 400, statusMessage: "안전 판정을 받은 자동 실행 가능 시나리오만 스위트에 담을 수 있습니다." });
  }

  const { data, error } = await client.from("test_suites").insert({
    analysis_id: analysisId, user_id: analysis.user_id, name: parsed.data.name, test_ids: parsed.data.testIds
  }).select("*").single();
  if (error || !data) throw createError({ statusCode: 500, statusMessage: "테스트 스위트를 저장하지 못했습니다." });
  setResponseStatus(event, 201);
  return { suite: rowToTestSuite(data) };
});
