import type { SupabaseClient } from "@supabase/supabase-js";
import { createError } from "h3";

export async function getGeneratedTestRow(client: SupabaseClient, analysisId: string, testId: string) {
  const { data, error } = await client
    .from("generated_tests")
    .select("id,analysis_id,page_id,user_id,source_id,title,safety_level,auto_executable,payload")
    .eq("analysis_id", analysisId)
    .eq("source_id", testId)
    .maybeSingle();

  if (error) {
    console.error("[generated-test-lookup]", { analysisId, testId, code: error.code });
    throw createError({ statusCode: 500, statusMessage: "테스트 시나리오 조회에 실패했습니다.", data: { code: "TEST_SCENARIO_LOOKUP_FAILED" } });
  }
  if (!data) throw createError({ statusCode: 404, statusMessage: "테스트 시나리오를 찾을 수 없습니다." });
  return data;
}
