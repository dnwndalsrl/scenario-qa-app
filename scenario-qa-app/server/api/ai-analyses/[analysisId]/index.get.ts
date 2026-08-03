import { aiFailureAnalysisService } from "../../../services/container.js";
import { AppError, defineApiHandler } from "../../../utils/api.js";

export default defineApiHandler(async (event) => {
  const analysisId = getRouterParam(event, "analysisId");
  if (analysisId === undefined || analysisId.length === 0) {
    throw new AppError(
      400,
      "AI_ANALYSIS_NOT_FOUND",
      "AI 분석 ID가 필요합니다."
    );
  }
  return aiFailureAnalysisService.get(analysisId);
});

