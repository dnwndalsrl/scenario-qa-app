import { getFailureAnalysisProviderConfig } from "../../../../ai/utils/failure-analysis-config.js";
import { aiFailureAnalysisService } from "../../../../services/container.js";
import {
  AppError,
  defineApiHandler,
  readBodyObject
} from "../../../../utils/api.js";

export default defineApiHandler(async (event) => {
  const runId = getRouterParam(event, "runId");
  if (runId === undefined || runId.length === 0) {
    throw new AppError(400, "TEST_RUN_NOT_FOUND", "테스트 실행 ID가 필요합니다.");
  }
  const body = await readBodyObject(event);
  if (body.force !== undefined && typeof body.force !== "boolean") {
    throw new AppError(
      400,
      "INVALID_REQUEST_BODY",
      "force는 true 또는 false여야 합니다."
    );
  }
  const config = getFailureAnalysisProviderConfig(event);
  const accepted = await aiFailureAnalysisService.request(
    runId,
    body.force === true,
    config
  );
  if (!accepted.reused) {
    setTimeout(() => {
      void aiFailureAnalysisService.execute(accepted.analysisId, config);
    }, 0);
  }
  return accepted;
});

