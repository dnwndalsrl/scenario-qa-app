import type { AppNotificationType, NotificationDelivery } from "../../../shared/types/notification.js";
import type { TestScheduleExecution } from "../../../shared/types/test-schedule.js";
import type { NotificationDeliveryRepository } from "../../repositories/notification-delivery.repository.js";
import type { TestScheduleRepository } from "../../repositories/test-schedule.repository.js";
import type { TestScheduleExecutionRepository } from "../../repositories/test-schedule-execution.repository.js";
import type { StoredTestSchedule } from "../../schedules/types/storage.js";
import { nowIso } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import { EmailNotificationAdapter, NotificationDeliveryError } from "../adapters/email.adapter.js";
import { SlackNotificationAdapter } from "../adapters/slack.adapter.js";
import type { NotificationRuntimeConfig } from "../utils/notification-config.js";
import { decryptSecret, maskEmail, validateSlackWebhookUrl } from "../utils/secret.js";
import { notificationRetryDelay } from "../utils/retry-backoff.js";
import type { AppNotificationService } from "./app-notification.service.js";
import { AppError } from "../../utils/api.js";

export interface ScheduleNotificationEvent {
  type: AppNotificationType;
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "error";
  suiteRunId?: string;
}

export class NotificationDeliveryService {
  private readonly email: EmailNotificationAdapter;
  private readonly slack = new SlackNotificationAdapter();

  constructor(
    private readonly repository: NotificationDeliveryRepository,
    private readonly appNotifications: AppNotificationService,
    private readonly config: NotificationRuntimeConfig,
    private readonly scheduleRepository: TestScheduleRepository,
    private readonly executionRepository: TestScheduleExecutionRepository,
    private readonly sleeper: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  ) {
    this.email = new EmailNotificationAdapter(config);
  }

  async deliver(schedule: StoredTestSchedule, execution: TestScheduleExecution, event: ScheduleNotificationEvent): Promise<NotificationDelivery[]> {
    const created: NotificationDelivery[] = [];
    let notificationId: string | undefined;
    const detailPath = `/projects/${encodeURIComponent(schedule.projectId)}/schedules/${encodeURIComponent(schedule.id)}/executions/${encodeURIComponent(execution.id)}`;
    if (schedule.notificationPolicy.channels.includes("in_app")) {
      const notification = await this.appNotifications.create({
        projectId: schedule.projectId, type: event.type, title: event.title,
        message: `${event.message}\n프로젝트: ${schedule.projectId}\n예약: ${schedule.name}${event.suiteRunId === undefined ? "" : `\n스위트 실행: ${event.suiteRunId}`}`,
        severity: event.severity, relatedType: "schedule_execution", relatedId: execution.id, href: detailPath
      });
      notificationId = notification.id;
      created.push(await this.createSent(execution, event.suiteRunId, "in_app", notification.id));
    }
    if (schedule.notificationPolicy.channels.includes("email")) {
      for (const target of schedule.emailTargets.filter((item) => item.enabled)) {
        const delivery = await this.createPending(execution, event.suiteRunId, "email", maskEmail(target.email), notificationId);
        created.push(await this.attempt(delivery, () => this.email.send({ to: target.email, subject: `[Scenario QA] ${event.title}`, text: this.messageBody(schedule, execution, event) })));
      }
    }
    if (schedule.notificationPolicy.channels.includes("slack")) {
      const delivery = await this.createPending(execution, event.suiteRunId, "slack", "Slack Webhook", notificationId);
      if (schedule.slackWebhookEncrypted === undefined) {
        created.push(await this.failWithoutAttempt(delivery, "SLACK_SECRET_MISSING", "Slack Webhook이 설정되지 않았습니다."));
      } else {
        created.push(await this.attempt(delivery, async () => {
          const url = validateSlackWebhookUrl(decryptSecret(schedule.slackWebhookEncrypted!, this.config.encryptionKey));
          await this.slack.send(url, this.messageBody(schedule, execution, event));
        }));
      }
    }
    const failedExternal = created.filter((delivery) => delivery.channel !== "in_app" && delivery.status === "failed");
    if (failedExternal.length > 0) {
      await this.appNotifications.create({
        projectId: schedule.projectId,
        type: "notification_delivery_failed",
        title: "외부 알림 전송에 실패했습니다",
        message: `${failedExternal.map((item) => item.channel).join(", ")} 채널의 설정과 전달 기록을 확인해 주세요.`,
        severity: "error",
        relatedType: "schedule_execution",
        relatedId: execution.id,
        href: detailPath
      });
    }
    return created;
  }

  async list(filters: { executionId?: string; status?: NotificationDelivery["status"]; channel?: NotificationDelivery["channel"] } = {}): Promise<NotificationDelivery[]> {
    return (await this.repository.list())
      .filter((item) =>
        (filters.executionId === undefined || item.scheduleExecutionId === filters.executionId) &&
        (filters.status === undefined || item.status === filters.status) &&
        (filters.channel === undefined || item.channel === filters.channel)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async retry(deliveryId: string): Promise<NotificationDelivery> {
    const delivery = await this.repository.findById(deliveryId);
    if (delivery === null) throw new AppError(404, "NOTIFICATION_DELIVERY_NOT_FOUND", "알림 전달 기록을 찾을 수 없습니다.");
    if (delivery.status !== "failed" || delivery.retryable === false) {
      throw new AppError(409, "NOTIFICATION_DELIVERY_NOT_RETRYABLE", "재시도 가능한 failed 상태의 알림만 다시 전송할 수 있습니다.");
    }
    const execution = await this.executionRepository.findById(delivery.scheduleExecutionId);
    if (execution === null) throw new AppError(404, "TEST_SCHEDULE_EXECUTION_NOT_FOUND", "연결된 예약 실행을 찾을 수 없습니다.");
    const schedule = await this.scheduleRepository.findById(execution.scheduleId);
    if (schedule === null || schedule.deletedAt !== undefined) throw new AppError(404, "TEST_SCHEDULE_NOT_FOUND", "연결된 예약을 찾을 수 없습니다.");
    const { errorCode: _code, errorMessage: _message, lastAttemptAt: _last, sentAt: _sent, retryable: _retryable, ...base } = delivery;
    const reset: NotificationDelivery = { ...base, status: "pending", attemptCount: 0, updatedAt: nowIso() };
    await this.repository.update(reset.id, reset);
    if (delivery.channel === "email") {
      const target = schedule.emailTargets.find((item) => maskEmail(item.email) === delivery.recipientMasked && item.enabled);
      if (target === undefined) return this.failWithoutAttempt(reset, "NOTIFICATION_TARGET_REQUIRED", "저장된 이메일 수신자를 찾을 수 없습니다.");
      return this.attempt(reset, () => this.email.send({ to: target.email, subject: `[Scenario QA] 알림 재전송`, text: `Scenario QA 알림을 다시 전송했습니다.\n예약: ${schedule.name}\n실행: ${execution.id}` }));
    }
    if (delivery.channel === "slack") {
      if (schedule.slackWebhookEncrypted === undefined) return this.failWithoutAttempt(reset, "NOTIFICATION_TARGET_REQUIRED", "저장된 Slack Webhook을 찾을 수 없습니다.");
      return this.attempt(reset, async () => {
        const url = validateSlackWebhookUrl(decryptSecret(schedule.slackWebhookEncrypted!, this.config.encryptionKey));
        await this.slack.send(url, `Scenario QA 알림을 다시 전송했습니다.\n예약: ${schedule.name}\n실행: ${execution.id}`);
      });
    }
    throw new AppError(409, "NOTIFICATION_DELIVERY_NOT_RETRYABLE", "앱 내부 알림은 재시도 대상이 아닙니다.");
  }

  private messageBody(schedule: StoredTestSchedule, execution: TestScheduleExecution, event: ScheduleNotificationEvent): string {
    const detailUrl = `${this.config.appBaseUrl}/projects/${encodeURIComponent(schedule.projectId)}/schedules/${encodeURIComponent(schedule.id)}/executions/${encodeURIComponent(execution.id)}`;
    return `${event.title}\n${event.message}\n프로젝트: ${schedule.projectId}\n예약: ${schedule.name}${event.suiteRunId === undefined ? "" : `\n스위트 실행: ${event.suiteRunId}`}\n예정 시각(UTC): ${execution.scheduledFor}\n상세: ${detailUrl}`;
  }

  private async attempt(delivery: NotificationDelivery, sender: () => Promise<void>): Promise<NotificationDelivery> {
    let current = delivery;
    const maximumAttempts = this.config.maxRetryCount + 1;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const timestamp = nowIso();
      current = (await this.repository.patch(current.id, { status: "sending", attemptCount: attempt, lastAttemptAt: timestamp, updatedAt: timestamp })) ?? current;
      try {
        await sender();
        const sentAt = nowIso();
        return (await this.repository.patch(current.id, { status: "sent", sentAt, updatedAt: sentAt })) ?? current;
      } catch (error: unknown) {
        const normalized = error instanceof NotificationDeliveryError ? error : new NotificationDeliveryError("NOTIFICATION_DELIVERY_FAILED", "알림 전송에 실패했습니다.", true);
        const terminal = !normalized.retryable || attempt >= maximumAttempts;
        const failedAt = nowIso();
        current = (await this.repository.patch(current.id, { status: terminal ? "failed" : "pending", errorCode: normalized.code, errorMessage: normalized.message, retryable: normalized.retryable, updatedAt: failedAt })) ?? current;
        if (terminal) return current;
        await this.sleeper(this.config.retryDelaysMs[attempt - 1] ?? notificationRetryDelay(attempt));
      }
    }
    return current;
  }

  private async createPending(execution: TestScheduleExecution, suiteRunId: string | undefined, channel: "email" | "slack", recipientMasked: string, notificationId: string | undefined): Promise<NotificationDelivery> {
    const timestamp = nowIso();
    return this.repository.create({
      id: createId("delivery"), ...(notificationId === undefined ? {} : { notificationId }),
      scheduleExecutionId: execution.id, ...(suiteRunId === undefined ? {} : { suiteRunId }),
      channel, status: "pending", recipientMasked, attemptCount: 0, createdAt: timestamp, updatedAt: timestamp
    });
  }

  private async createSent(execution: TestScheduleExecution, suiteRunId: string | undefined, channel: "in_app", notificationId: string): Promise<NotificationDelivery> {
    const timestamp = nowIso();
    return this.repository.create({ id: createId("delivery"), notificationId, scheduleExecutionId: execution.id, ...(suiteRunId === undefined ? {} : { suiteRunId }), channel, status: "sent", recipientMasked: "앱 알림", attemptCount: 1, lastAttemptAt: timestamp, sentAt: timestamp, createdAt: timestamp, updatedAt: timestamp });
  }

  private async failWithoutAttempt(delivery: NotificationDelivery, errorCode: string, errorMessage: string): Promise<NotificationDelivery> {
    return (await this.repository.patch(delivery.id, { status: "failed", errorCode, errorMessage, retryable: false, updatedAt: nowIso() })) ?? delivery;
  }
}
