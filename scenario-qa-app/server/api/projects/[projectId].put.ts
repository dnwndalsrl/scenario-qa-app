import { projectService } from "../../services/container.js";
import {
  AppError,
  defineApiHandler,
  readBodyObject
} from "../../utils/api.js";
import { parseProjectInput } from "../../validators/project.validator.js";

export default defineApiHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (projectId === undefined) {
    throw new AppError(400, "PROJECT_ID_REQUIRED", "프로젝트 ID가 필요합니다.");
  }
  const input = parseProjectInput(await readBodyObject(event));
  return projectService.update(projectId, input);
});
