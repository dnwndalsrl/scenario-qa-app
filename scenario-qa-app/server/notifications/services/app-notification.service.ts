import type { AppNotification, AppNotificationType, NotificationListResult } from "../../../shared/types/notification.js";
import type { AppNotificationRepository } from "../../repositories/app-notification.repository.js";
import { AppError } from "../../utils/api.js";
import { nowIso } from "../../utils/date.js";
import { createId } from "../../utils/id.js";

export interface CreateAppNotificationInput {
  projectId: string;
  type: AppNotificationType;
  title: string;
  message: string;
  severity: AppNotification["severity"];
  relatedType: AppNotification["relatedType"];
  relatedId: string;
  href?: string;
}

export class AppNotificationService {
  constructor(private readonly repository: AppNotificationRepository) {}

  async list(projectId?: string): Promise<NotificationListResult> {
    const items = projectId === undefined
      ? (await this.repository.list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : await this.repository.listByProject(projectId);
    return { items, unreadCount: items.filter((item) => item.readAt === undefined).length };
  }

  async create(input: CreateAppNotificationInput): Promise<AppNotification> {
    const notification: AppNotification = {
      id: createId("notification"),
      projectId: input.projectId,
      type: input.type,
      title: truncate(input.title, 160),
      message: truncate(input.message, 2000),
      severity: input.severity,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      ...(input.href === undefined ? {} : { href: input.href }),
      createdAt: nowIso()
    };
    return this.repository.create(notification);
  }

  async markRead(notificationId: string): Promise<AppNotification> {
    const saved = await this.repository.patch(notificationId, { readAt: nowIso() });
    if (saved === null) throw new AppError(404, "NOTIFICATION_NOT_FOUND", "알림을 찾을 수 없습니다.");
    return saved;
  }

  async markAllRead(projectId: string): Promise<number> {
    return this.repository.markAllRead(projectId, nowIso());
  }
}

function truncate(value: string, maximum: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maximum);
}
