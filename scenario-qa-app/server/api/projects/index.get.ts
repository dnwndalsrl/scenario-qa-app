import { projectService } from "../../services/container.js";
import { defineApiHandler } from "../../utils/api.js";

export default defineApiHandler(async () => projectService.list());
