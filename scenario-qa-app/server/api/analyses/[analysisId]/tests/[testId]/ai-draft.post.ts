import type { GeneratedTestScenario, PageSnapshot } from "../../../../../../shared/types/analysis";
import { getOwnedAnalysis } from "../../../../../services/analysis-records.service";
import { getGeneratedTestRow } from "../../../../../services/generated-test-record.service";
import { generateNaturalLanguageScenarioDraft, naturalLanguageScenarioRequestSchema } from "../../../../../services/natural-language-scenario-editor.service";
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

  let snapshotQuery = client.from("page_snapshots").select("payload").eq("analysis_id", analysisId).order("created_at", { ascending: false }).limit(1);
  snapshotQuery = testRow.page_id ? snapshotQuery.eq("page_id", testRow.page_id) : snapshotQuery.is("page_id", null);
  const { data: snapshotRows, error: snapshotError } = await snapshotQuery;
  const snapshot = snapshotRows?.[0]?.payload as PageSnapshot | undefined;
  if (snapshotError || !snapshot) throw createError({ statusCode: 409, statusMessage: "테스트 대상 페이지 스냅샷을 찾을 수 없습니다." });

  return generateNaturalLanguageScenarioDraft(testRow.payload as GeneratedTestScenario, snapshot, parsed.data.instruction);
});
