import type { PageSnapshot, RequirementDocumentAnalysis } from "../../../../../../shared/types/analysis";
import { AppError } from "../../../../../../shared/errors";
import { getOwnedAnalysis } from "../../../../../services/analysis-records.service";
import { generateRequirementScenarioDraft, selectRequirementSnapshot } from "../../../../../services/requirement-scenario-draft.service";
import { requireUser } from "../../../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const requirementId = getRouterParam(event, "requirementId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  if (!["completed", "partially_completed", "failed"].includes(analysis.status)) throw createError({ statusCode: 409, statusMessage: "분석이 끝난 뒤 시나리오 초안을 만들 수 있습니다." });

  const [documentResult, snapshotsResult] = await Promise.all([
    client.from("requirement_documents").select("payload,status").eq("analysis_id", analysisId).maybeSingle(),
    client.from("page_snapshots").select("payload").eq("analysis_id", analysisId).order("created_at", { ascending: false })
  ]);
  const document = documentResult.data?.payload as RequirementDocumentAnalysis | undefined;
  if (documentResult.error || !document || documentResult.data?.status !== "completed") throw createError({ statusCode: 409, statusMessage: "분석이 완료된 요구사항 문서를 찾을 수 없습니다." });
  const requirement = document.requirements.find((item) => item.id === requirementId);
  if (!requirement) throw createError({ statusCode: 404, statusMessage: "요구사항을 찾을 수 없습니다." });
  if (snapshotsResult.error) throw createError({ statusCode: 500, statusMessage: "페이지 스냅샷을 조회하지 못했습니다." });
  const snapshot = selectRequirementSnapshot(requirement, (snapshotsResult.data || []).map((row) => row.payload as PageSnapshot));
  if (!snapshot) return { verificationPossible: false, reason: "요구사항과 연결되는 페이지 근거를 찾지 못했습니다. 구현 위치를 확인해 주세요." };

  try { return await generateRequirementScenarioDraft(requirement, snapshot); }
  catch (cause) {
    if (cause instanceof AppError) throw createError({ statusCode: cause.statusCode, statusMessage: cause.message });
    throw createError({ statusCode: 500, statusMessage: "요구사항 시나리오 초안을 만들지 못했습니다." });
  }
});
