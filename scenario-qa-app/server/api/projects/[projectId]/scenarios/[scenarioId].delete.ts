import { scenarioService } from "../../../../services/container.js";
import { AppError, defineApiHandler } from "../../../../utils/api.js";

export default defineApiHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const scenarioId = getRouterParam(event, "scenarioId");
  if (projectId === undefined || scenarioId === undefined) {
    throw new AppError(400, "RESOURCE_ID_REQUIRED", "프로젝트와 시나리오 ID가 필요합니다.");
  }
  await scenarioService.delete(projectId, scenarioId);
  return { deleted: true };
});
