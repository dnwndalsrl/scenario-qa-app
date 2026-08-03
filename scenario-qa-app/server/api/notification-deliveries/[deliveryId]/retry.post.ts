import { notificationDeliveryService } from "../../../services/container.js";
import { AppError, defineApiHandler } from "../../../utils/api.js";
export default defineApiHandler(async (event) => { const deliveryId = getRouterParam(event, "deliveryId"); if (!deliveryId) throw new AppError(400, "NOTIFICATION_DELIVERY_NOT_FOUND", "알림 전달 ID가 필요합니다."); return notificationDeliveryService.retry(deliveryId); });
