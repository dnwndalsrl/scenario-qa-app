import type { AppNotification } from "../../shared/types/notification.js";
import { getStorageFile } from "../utils/file-storage.js";
import { JsonArrayRepository } from "./json-array.repository.js";

export class AppNotificationRepository extends JsonArrayRepository<AppNotification> {
  constructor() {
    super(getStorageFile("app-notifications.json"));
  }

  async listByProject(projectId: string): Promise<AppNotification[]> {
    return (await this.list())
      .filter((item) => item.projectId === projectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async patch(
    id: string,
    changes: Partial<AppNotification>
  ): Promise<AppNotification | null> {
    const current = await this.findById(id);
    if (current === null) return null;
    return this.update(id, { ...current, ...changes, id: current.id });
  }

  async markAllRead(projectId: string, readAt: string): Promise<number> {
    const items = await this.listByProject(projectId);
    let count = 0;
    for (const item of items) {
      if (item.readAt === undefined) {
        await this.patch(item.id, { readAt });
        count += 1;
      }
    }
    return count;
  }

  async deleteByProject(projectId: string): Promise<AppNotification[]> {
    return this.deleteWhere((item) => item.projectId === projectId);
  }
}
