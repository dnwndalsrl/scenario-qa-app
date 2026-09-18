import { z } from "zod";
import type { GeneratedTestScenario } from "../../../../../../shared/types/analysis";
import { getOwnedAnalysis } from "../../../../../services/analysis-records.service";
import { getGeneratedTestRow } from "../../../../../services/generated-test-record.service";
import { requireUser } from "../../../../../services/supabase.service";

const schema = z.object({ included: z.boolean() });

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const testId = getRouterParam(event, "testId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  if (analysis.process_stage !== "scenario_review") {
    throw createError({ statusCode: 409, statusMessage: "시나리오 검토 단계에서만 실행 대상을 변경할 수 있습니다." });
  }
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "시나리오 선택값을 확인해 주세요." });

  const row = await getGeneratedTestRow(client, analysisId, testId);
  const scenario = row.payload as GeneratedTestScenario;
  const updated: GeneratedTestScenario = {
    ...scenario,
    reviewDisposition: parsed.data.included ? "included" : "excluded"
  };
  const { error } = await client.from("generated_tests").update({ payload: updated }).eq("id", row.id);
  if (error) throw createError({ statusCode: 500, statusMessage: "시나리오 실행 대상을 저장하지 못했습니다." });
  return { test: updated };
});
