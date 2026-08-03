import { appNotificationService } from "../../services/container.js";
import { AppError, defineApiHandler, readBodyObject } from "../../utils/api.js";

export default defineApiHandler(async (event) => {
  const body = await readBodyObject(event);
  if (typeof body.projectId !== "string" || !body.projectId) throw new AppError(400, "PROJECT_ID_REQUIRED", "프로젝트 ID가 필요합니다.");
  return { updatedCount: await appNotificationService.markAllRead(body.projectId) };
});
