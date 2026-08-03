import { projectService } from "../../services/container.js";
import { defineApiHandler, readBodyObject } from "../../utils/api.js";
import { parseProjectInput } from "../../validators/project.validator.js";

export default defineApiHandler(async (event) => {
  const input = parseProjectInput(await readBodyObject(event));
  return projectService.create(input);
});
