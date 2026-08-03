import { testSuiteService } from "../../../../services/container.js";
import { AppError, defineApiHandler } from "../../../../utils/api.js";

export default defineApiHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const suiteId = getRouterParam(event, "suiteId");
  if (projectId === undefined || suiteId === undefined) {
    throw new AppError(400, "TEST_SUITE_VALIDATION_FAILED", "프로젝트와 스위트 ID가 필요합니다.");
  }
  return testSuiteService.get(projectId, suiteId);
});
