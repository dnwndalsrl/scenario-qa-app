import { scenarioService } from "../../../../services/container.js";
import {
  AppError,
  defineApiHandler,
  readBodyObject
} from "../../../../utils/api.js";
import { parseScenarioInput } from "../../../../validators/scenario.validator.js";

export default defineApiHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  const scenarioId = getRouterParam(event, "scenarioId");
  if (projectId === undefined || scenarioId === undefined) {
    throw new AppError(400, "RESOURCE_ID_REQUIRED", "프로젝트와 시나리오 ID가 필요합니다.");
  }
  const input = parseScenarioInput(await readBodyObject(event));
  return scenarioService.update(projectId, scenarioId, input);
});
