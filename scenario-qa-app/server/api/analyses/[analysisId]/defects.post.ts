import { randomUUID } from "node:crypto";
import type { AutomatedTestRun, GeneratedTestScenario } from "../../../../shared/types/analysis";
import { getOwnedAnalysis } from "../../../services/analysis-records.service";
import { buildQaDefect, qaDefectCreateSchema } from "../../../services/qa-defect.service";
import { createServiceSupabaseClient, requireUser } from "../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client, user } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  const parsed = qaDefectCreateSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "결함 등록 내용을 확인해 주세요." });
  const admin = createServiceSupabaseClient(event);
  const { data: duplicate } = await admin.from("analysis_issues").select("id").eq("analysis_id", analysisId).eq("kind", "defect").eq("payload->>sourceRunId", parsed.data.runId).maybeSingle();
  if (duplicate) throw createError({ statusCode: 409, statusMessage: "이 실행 결과는 이미 결함으로 등록되었습니다." });
  const { data: runRow, error: runError } = await admin.from("test_runs").select("test_id,payload").eq("analysis_id", analysisId).eq("source_id", parsed.data.runId).maybeSingle();
  const run = runRow?.payload as AutomatedTestRun | undefined;
  if (runError || !runRow || !run) throw createError({ statusCode: 404, statusMessage: "결함으로 등록할 테스트 실행을 찾을 수 없습니다." });
  if (!["failed", "error", "blocked"].includes(run.status)) throw createError({ statusCode: 409, statusMessage: "실패하거나 차단된 테스트만 결함으로 등록할 수 있습니다." });
  const { data: testRow, error: testError } = await admin.from("generated_tests").select("page_id,payload").eq("id", runRow.test_id).eq("analysis_id", analysisId).maybeSingle();
  const scenario = testRow?.payload as GeneratedTestScenario | undefined;
  if (testError || !testRow || !scenario) throw createError({ statusCode: 404, statusMessage: "연결된 테스트 시나리오를 찾을 수 없습니다." });
  const id = randomUUID();
  const defect = buildQaDefect(id, run, scenario, analysis.normalized_url, parsed.data, user.email || user.id, new Date().toISOString());
  const { error } = await admin.from("analysis_issues").insert({ id, analysis_id: analysisId, page_id: testRow.page_id, user_id: analysis.user_id, kind: "defect", severity: defect.severity, title: defect.title, payload: defect });
  if (error) throw createError({ statusCode: 500, statusMessage: "결함을 저장하지 못했습니다." });
  setResponseStatus(event, 201);
  return { defect };
});
