import { testSuiteRunService } from "../../../services/container.js";
import { AppError, defineApiHandler } from "../../../utils/api.js";

export default defineApiHandler(async (event) => {
  const suiteRunId = getRouterParam(event, "suiteRunId");
  if (suiteRunId === undefined) {
    throw new AppError(400, "TEST_SUITE_RUN_NOT_FOUND", "스위트 실행 ID가 필요합니다.");
  }
  return testSuiteRunService.listItems(suiteRunId);
});
