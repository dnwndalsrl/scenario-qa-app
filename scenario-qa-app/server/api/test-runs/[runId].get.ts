import { testRunService } from "../../services/container.js";
import { AppError, defineApiHandler } from "../../utils/api.js";

export default defineApiHandler(async (event) => {
  const runId = getRouterParam(event, "runId");
  if (runId === undefined) {
    throw new AppError(400, "RUN_ID_REQUIRED", "테스트 실행 ID가 필요합니다.");
  }
  return testRunService.getDetail(runId);
});
