import { testScheduleService } from "../../../../services/container.js";
import { AppError, defineApiHandler } from "../../../../utils/api.js";

export default defineApiHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) throw new AppError(400, "PROJECT_ID_REQUIRED", "프로젝트 ID가 필요합니다.");
  const suiteId = getQuery(event).suiteId;
  return testScheduleService.list(projectId, typeof suiteId === "string" ? suiteId : undefined);
});
