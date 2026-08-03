import { testSuiteService } from "../../../../services/container.js";
import { AppError, defineApiHandler } from "../../../../utils/api.js";

export default defineApiHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (projectId === undefined) {
    throw new AppError(400, "PROJECT_ID_REQUIRED", "프로젝트 ID가 필요합니다.");
  }
  return testSuiteService.list(projectId);
});
