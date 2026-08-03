import type { NotificationChannel } from "./test-schedule.js";

export type AppNotificationType =
  | "suite_run_success"
  | "suite_run_failed"
  | "suite_run_partial_success"
  | "regression_detected"
  | "schedule_execution_skipped"
  | "schedule_execution_failed"
  | "notification_delivery_failed";

export interface AppNotification {
  id: string;
  projectId: string;
  type: AppNotificationType;
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "error";
  relatedType: "suite_run" | "schedule_execution" | "test_run_comparison";
  relatedId: string;
  href?: string;
  readAt?: string;
  createdAt: string;
}

export type NotificationDeliveryStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "skipped";

export interface NotificationDelivery {
  id: string;
  notificationId?: string;
  scheduleExecutionId: string;
  suiteRunId?: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  recipientMasked?: string;
  attemptCount: number;
  lastAttemptAt?: string;
  sentAt?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListResult {
  items: AppNotification[];
  unreadCount: number;
}
