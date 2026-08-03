import type { NotificationChannel } from "../../../shared/types/test-schedule.js";
import type { NotificationDeliveryStatus } from "../../../shared/types/notification.js";
import { notificationDeliveryService } from "../../services/container.js";
import { defineApiHandler } from "../../utils/api.js";
export default defineApiHandler(async (event) => {
  const query = getQuery(event);
  return notificationDeliveryService.list({
    ...(typeof query.executionId === "string" ? { executionId: query.executionId } : {}),
    ...(typeof query.status === "string" ? { status: query.status as NotificationDeliveryStatus } : {}),
    ...(typeof query.channel === "string" ? { channel: query.channel as NotificationChannel } : {})
  });
});
