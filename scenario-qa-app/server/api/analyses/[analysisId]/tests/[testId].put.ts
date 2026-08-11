import type { GeneratedTestScenario, PageSnapshot } from "../../../../../shared/types/analysis";
import { getOwnedAnalysis } from "../../../../services/analysis-records.service";
import { buildEditedScenario, updateGeneratedTestSchema } from "../../../../services/generated-test-editor.service";
import { getGeneratedTestRow } from "../../../../services/generated-test-record.service";
import { createServiceSupabaseClient, requireUser } from "../../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const testId = getRouterParam(event, "testId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  if (!["completed", "partially_completed", "failed"].includes(analysis.status)) {
    throw createError({ statusCode: 409, statusMessage: "분석이 끝난 뒤 테스트 시나리오를 수정할 수 있습니다." });
  }

  const parsed = updateGeneratedTestSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "테스트 시나리오 입력값을 확인해 주세요." });

  const admin = createServiceSupabaseClient();
  const testRow = await getGeneratedTestRow(admin, analysisId, testId);

  let snapshotQuery = admin.from("page_snapshots").select("payload").eq("analysis_id", analysisId).order("created_at", { ascending: false }).limit(1);
  snapshotQuery = testRow.page_id ? snapshotQuery.eq("page_id", testRow.page_id) : snapshotQuery.is("page_id", null);
  const { data: snapshotRows, error: snapshotError } = await snapshotQuery;
  const snapshot = snapshotRows?.[0]?.payload as PageSnapshot | undefined;
  if (snapshotError || !snapshot) throw createError({ statusCode: 409, statusMessage: "테스트 대상 페이지 스냅샷을 찾을 수 없습니다." });

  let edited: GeneratedTestScenario;
  try {
    edited = buildEditedScenario(testRow.payload as GeneratedTestScenario, snapshot, parsed.data);
  } catch (cause) {
    throw createError({ statusCode: 400, statusMessage: cause instanceof Error ? cause.message : "테스트 시나리오를 수정할 수 없습니다." });
  }

  const { error: updateError } = await admin.from("generated_tests").update({
    title: edited.title, safety_level: edited.safetyLevel, auto_executable: edited.autoExecutable, payload: edited
  }).eq("id", testRow.id);
  if (updateError) throw createError({ statusCode: 500, statusMessage: "테스트 시나리오 저장에 실패했습니다." });

  const { error: deleteError } = await admin.from("generated_test_steps").delete().eq("test_id", testRow.id);
  if (deleteError) throw createError({ statusCode: 500, statusMessage: "기존 테스트 단계를 정리하지 못했습니다." });
  const { error: stepError } = await admin.from("generated_test_steps").insert(edited.steps.map((step) => ({
    test_id: testRow.id, analysis_id: analysisId, user_id: testRow.user_id,
    step_order: step.order, action: step.action, payload: step
  })));
  if (stepError) throw createError({ statusCode: 500, statusMessage: "수정한 테스트 단계 저장에 실패했습니다." });

  return { test: edited };
});
