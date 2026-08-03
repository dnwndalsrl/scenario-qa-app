import type { NotificationDelivery } from "../../shared/types/notification.js";
import { getStorageFile } from "../utils/file-storage.js";
import { JsonArrayRepository } from "./json-array.repository.js";

export class NotificationDeliveryRepository extends JsonArrayRepository<NotificationDelivery> {
  constructor() {
    super(getStorageFile("notification-deliveries.json"));
  }

  async listByExecution(executionId: string): Promise<NotificationDelivery[]> {
    return (await this.list())
      .filter((item) => item.scheduleExecutionId === executionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async patch(
    id: string,
    changes: Partial<NotificationDelivery>
  ): Promise<NotificationDelivery | null> {
    const current = await this.findById(id);
    if (current === null) return null;
    return this.update(id, { ...current, ...changes, id: current.id });
  }

  async deleteByExecutionIds(executionIds: Set<string>): Promise<NotificationDelivery[]> {
    return this.deleteWhere((item) => executionIds.has(item.scheduleExecutionId));
  }
}
