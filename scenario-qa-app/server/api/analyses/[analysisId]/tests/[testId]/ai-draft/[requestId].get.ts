import type { GeneratedTestScenario } from "../../../../../../../shared/types/analysis";
import { getOwnedAnalysis } from "../../../../../../services/analysis-records.service";
import { getGeneratedTestRow } from "../../../../../../services/generated-test-record.service";
import { requireUser } from "../../../../../../services/supabase.service";

interface AiEditState {
  requestId: string;
  status: "pending" | "completed" | "failed";
  summary?: string;
  draft?: unknown;
  error?: string;
}

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const testId = getRouterParam(event, "testId") || "";
  const requestId = getRouterParam(event, "requestId") || "";
  await getOwnedAnalysis(client, analysisId);
  const testRow = await getGeneratedTestRow(client, analysisId, testId);
  const state = (testRow.payload as GeneratedTestScenario & { aiEdit?: AiEditState }).aiEdit;
  if (!state || state.requestId !== requestId) throw createError({ statusCode: 404, statusMessage: "AI 수정 요청을 찾을 수 없습니다." });
  if (state.status === "failed") throw createError({ statusCode: 422, statusMessage: state.error || "AI 수정안을 만들지 못했습니다." });
  if (state.status !== "completed" || !state.draft || !state.summary) {
    setResponseStatus(event, 202);
    return { requestId, status: "pending" };
  }
  return { requestId, status: "completed", draft: state.draft, summary: state.summary };
});
