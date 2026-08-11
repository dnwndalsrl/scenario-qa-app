import type { PageSnapshot } from "../../../../../shared/types/analysis";
import { getOwnedAnalysis } from "../../../../services/analysis-records.service";
import { buildAddedScenario, createGeneratedTestSchema } from "../../../../services/generated-test-editor.service";
import { createServiceSupabaseClient, requireUser } from "../../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  if (analysis.process_stage !== "scenario_review") throw createError({ statusCode: 409, statusMessage: "시나리오 검토 단계에서만 테스트를 추가할 수 있습니다." });
  const parsed = createGeneratedTestSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "테스트 시나리오 입력값을 확인해 주세요." });
  const admin = createServiceSupabaseClient();
  let pageDbId: string | null = null;
  if (parsed.data.pageId) {
    const { data: page } = await admin.from("analysis_pages").select("id").eq("analysis_id", analysisId).eq("source_id", parsed.data.pageId).single();
    if (!page) throw createError({ statusCode: 400, statusMessage: "대상 페이지를 찾을 수 없습니다." });
    pageDbId = page.id;
  }
  let snapshotQuery = admin.from("page_snapshots").select("payload").eq("analysis_id", analysisId).order("created_at", { ascending: false }).limit(1);
  snapshotQuery = pageDbId ? snapshotQuery.eq("page_id", pageDbId) : snapshotQuery.is("page_id", null);
  const { data: snapshotRows } = await snapshotQuery;
  const snapshot = snapshotRows?.[0]?.payload as PageSnapshot | undefined;
  if (!snapshot) throw createError({ statusCode: 409, statusMessage: "테스트 대상 페이지 스냅샷을 찾을 수 없습니다." });
  let scenario;
  try { scenario = buildAddedScenario(analysisId, snapshot, parsed.data); }
  catch (cause) { throw createError({ statusCode: 400, statusMessage: cause instanceof Error ? cause.message : "시나리오를 추가할 수 없습니다." }); }
  const { data: row, error } = await admin.from("generated_tests").insert({
    analysis_id: analysisId, page_id: pageDbId, user_id: analysis.user_id, source_id: scenario.id,
    title: scenario.title, safety_level: scenario.safetyLevel, auto_executable: scenario.autoExecutable, payload: scenario
  }).select("id").single();
  if (error || !row) throw createError({ statusCode: 500, statusMessage: "시나리오 저장에 실패했습니다." });
  const { error: stepError } = await admin.from("generated_test_steps").insert(scenario.steps.map((step) => ({
    test_id: row.id, analysis_id: analysisId, user_id: analysis.user_id, step_order: step.order, action: step.action, payload: step
  })));
  if (stepError) throw createError({ statusCode: 500, statusMessage: "시나리오 단계 저장에 실패했습니다." });
  setResponseStatus(event, 201);
  return { test: scenario };
});
