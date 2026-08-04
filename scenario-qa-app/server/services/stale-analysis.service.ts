import type { SupabaseClient } from "@supabase/supabase-js";

export async function recoverStaleAnalysis(client: SupabaseClient, analysisId: string): Promise<void> {
  const { error } = await client.rpc("expire_stale_analysis", { p_analysis_id: analysisId });
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "중단된 분석 상태를 확인하지 못했습니다.",
      data: { code: "STALE_ANALYSIS_CHECK_FAILED" }
    });
  }
}
