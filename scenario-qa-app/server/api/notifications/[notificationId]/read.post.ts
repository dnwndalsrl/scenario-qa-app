import { appNotificationService } from "../../../services/container.js";
import { AppError, defineApiHandler } from "../../../utils/api.js";

export default defineApiHandler(async (event) => {
  const notificationId = getRouterParam(event, "notificationId");
  if (!notificationId) throw new AppError(400, "NOTIFICATION_ID_REQUIRED", "알림 ID가 필요합니다.");
  return appNotificationService.markRead(notificationId);
});
