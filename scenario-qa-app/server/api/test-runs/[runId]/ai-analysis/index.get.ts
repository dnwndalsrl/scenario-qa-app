import { aiFailureAnalysisService } from "../../../../services/container.js";
import { AppError, defineApiHandler } from "../../../../utils/api.js";

export default defineApiHandler(async (event) => {
  const runId = getRouterParam(event, "runId");
  if (runId === undefined || runId.length === 0) {
    throw new AppError(400, "TEST_RUN_NOT_FOUND", "테스트 실행 ID가 필요합니다.");
  }
  return {
    analysis: await aiFailureAnalysisService.getLatestByRun(runId)
  };
});

