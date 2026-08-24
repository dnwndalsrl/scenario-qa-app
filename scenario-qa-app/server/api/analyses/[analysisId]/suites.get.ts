import { getOwnedAnalysis } from "../../../services/analysis-records.service";
import { requireUser } from "../../../services/supabase.service";
import { rowToTestSuite } from "../../../services/test-suite.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  await getOwnedAnalysis(client, analysisId);
  const { data, error } = await client.from("test_suites").select("*").eq("analysis_id", analysisId).order("created_at", { ascending: false });
  if (error) throw createError({ statusCode: 500, statusMessage: "테스트 스위트를 조회하지 못했습니다." });
  return { suites: (data || []).map(rowToTestSuite) };
});
