import { randomUUID } from "node:crypto";
import type { AutomatedTestRun, GeneratedTestScenario } from "../../../../../../shared/types/analysis";
import { getOwnedAnalysis } from "../../../../../services/analysis-records.service";
import { buildAutomaticQaDefectInput, buildQaDefect } from "../../../../../services/qa-defect.service";
import { applyTestRunReview, testRunReviewSchema } from "../../../../../services/test-run-review.service";
import { createServiceSupabaseClient, requireUser } from "../../../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client, user } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const runId = getRouterParam(event, "runId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);

  const parsed = testRunReviewSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "실패 결과 판정 입력값을 확인해 주세요." });

  const admin = createServiceSupabaseClient(event);
  const { data: row, error: readError } = await admin.from("test_runs").select("id,test_id,payload").eq("analysis_id", analysisId).eq("source_id", runId).maybeSingle();
  if (readError) throw createError({ statusCode: 500, statusMessage: "실행 결과를 불러오지 못했습니다." });
  if (!row) throw createError({ statusCode: 404, statusMessage: "실행 결과를 찾을 수 없습니다." });

  const run = row.payload as AutomatedTestRun;
  if (!run) throw createError({ statusCode: 404, statusMessage: "실행 결과를 찾을 수 없습니다." });
  let defectId = run.review?.defectId;
  if (parsed.data.classification === "actual_defect") {
    const { data: duplicate, error: duplicateError } = await admin.from("analysis_issues").select("id").eq("analysis_id", analysisId).eq("kind", "defect").eq("payload->>sourceRunId", runId).maybeSingle();
    if (duplicateError) throw createError({ statusCode: 500, statusMessage: "연결된 결함을 확인하지 못했습니다." });
    defectId = duplicate?.id;
    if (!defectId) {
      const { data: testRow, error: testError } = await admin.from("generated_tests").select("page_id,payload").eq("id", row.test_id).eq("analysis_id", analysisId).maybeSingle();
      const scenario = testRow?.payload as GeneratedTestScenario | undefined;
      if (testError || !testRow || !scenario) throw createError({ statusCode: 404, statusMessage: "연결된 테스트 시나리오를 찾을 수 없습니다." });
      defectId = randomUUID();
      const now = new Date().toISOString();
      const input = buildAutomaticQaDefectInput(run, scenario, parsed.data.note);
      const defect = buildQaDefect(defectId, run, scenario, analysis.normalized_url, input, user.email || user.id, now);
      const { error: insertError } = await admin.from("analysis_issues").insert({ id: defectId, analysis_id: analysisId, page_id: testRow.page_id, user_id: analysis.user_id, kind: "defect", severity: defect.severity, title: defect.title, payload: defect });
      if (insertError) throw createError({ statusCode: 500, statusMessage: "실제 결함을 등록하지 못했습니다." });
    }
  }

  let reviewed: AutomatedTestRun;
  try {
    reviewed = applyTestRunReview(run, parsed.data, new Date().toISOString(), defectId);
  } catch (cause) {
    throw createError({ statusCode: 409, statusMessage: cause instanceof Error ? cause.message : "이 실행 결과를 판정할 수 없습니다." });
  }

  const { error: updateError } = await admin.from("test_runs").update({ payload: reviewed }).eq("id", row.id);
  if (updateError) throw createError({ statusCode: 500, statusMessage: "실패 결과 판정을 저장하지 못했습니다." });
  return { run: reviewed };
});
