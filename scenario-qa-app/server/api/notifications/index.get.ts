import { appNotificationService } from "../../services/container.js";
import { defineApiHandler } from "../../utils/api.js";

export default defineApiHandler(async (event) => {
  const projectId = getQuery(event).projectId;
  return appNotificationService.list(typeof projectId === "string" ? projectId : undefined);
});
