import type {
  EmailNotificationTargetInput,
  ScheduleNotificationPolicy,
  TestScheduleConfig,
  TestScheduleInput
} from "../../shared/types/test-schedule.js";
import { assertCronInterval } from "../schedules/utils/next-run-calculator.js";
import { assertValidTimezone } from "../schedules/utils/timezone-validator.js";
import { AppError } from "../utils/api.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPES = ["once", "daily", "weekly", "monthly", "cron"] as const;

export function parseTestScheduleInput(
  value: Record<string, unknown>,
  minimumCronMinutes: number
): TestScheduleInput {
  const scheduleType = scheduleTypeValue(value.scheduleType);
  const timezone = requiredString(value.timezone, "timezone", 100);
  assertValidTimezone(timezone);
  const scheduleConfig = parseScheduleConfig(value.scheduleConfig, scheduleType);
  if (scheduleConfig.type === "cron") {
    assertCronInterval(scheduleConfig.expression, timezone, minimumCronMinutes);
  }
  const notificationPolicy = parseNotificationPolicy(value.notificationPolicy);
  const emailTargets = parseEmailTargets(value.emailTargets);
  const description = optionalString(value.description, "description", 1000);
  const slackWebhookUrl = optionalString(value.slackWebhookUrl, "slackWebhookUrl", 1000);
  return {
    suiteId: requiredString(value.suiteId, "suiteId", 200),
    name: requiredString(value.name, "name", 100),
    ...(description === undefined ? {} : { description }),
    status: enumValue(value.status, ["active", "inactive"] as const, "status"),
    scheduleType,
    timezone,
    scheduleConfig,
    concurrencyPolicy: enumValue(
      value.concurrencyPolicy,
      ["skip", "queue_once"] as const,
      "concurrencyPolicy"
    ),
    missedRunPolicy: enumValue(
      value.missedRunPolicy,
      ["skip", "run_once"] as const,
      "missedRunPolicy"
    ),
    notificationPolicy,
    emailTargets,
    ...(slackWebhookUrl === undefined ? {} : { slackWebhookUrl })
  };
}

export function parseSchedulePreviewInput(
  value: Record<string, unknown>,
  minimumCronMinutes: number
): { scheduleConfig: TestScheduleConfig; timezone: string } {
  const scheduleType = scheduleTypeValue(value.scheduleType);
  const timezone = requiredString(value.timezone, "timezone", 100);
  assertValidTimezone(timezone);
  const scheduleConfig = parseScheduleConfig(value.scheduleConfig, scheduleType);
  if (scheduleConfig.type === "cron") {
    assertCronInterval(scheduleConfig.expression, timezone, minimumCronMinutes);
  }
  return { scheduleConfig, timezone };
}

export function parseScheduleConfig(
  value: unknown,
  expectedType: (typeof TYPES)[number]
): TestScheduleConfig {
  const object = objectValue(value, "scheduleConfig");
  const type = scheduleTypeValue(object.type);
  if (type !== expectedType) {
    invalid("TEST_SCHEDULE_TYPE_MISMATCH", "scheduleType과 scheduleConfig.type이 일치해야 합니다.");
  }
  switch (type) {
    case "once":
      return { type, runAt: requiredString(object.runAt, "runAt", 100) };
    case "daily":
      return { type, hour: integer(object.hour, "hour", 0, 23), minute: integer(object.minute, "minute", 0, 59) };
    case "weekly": {
      if (!Array.isArray(object.daysOfWeek) || object.daysOfWeek.length === 0) {
        invalid("TEST_SCHEDULE_INVALID_CONFIG", "주간 실행 요일을 한 개 이상 선택해 주세요.");
      }
      const daysOfWeek = object.daysOfWeek.map((day) => integer(day, "daysOfWeek", 0, 6));
      if (new Set(daysOfWeek).size !== daysOfWeek.length) {
        invalid("TEST_SCHEDULE_INVALID_CONFIG", "주간 실행 요일은 중복될 수 없습니다.");
      }
      return { type, daysOfWeek, hour: integer(object.hour, "hour", 0, 23), minute: integer(object.minute, "minute", 0, 59) };
    }
    case "monthly":
      return {
        type,
        dayOfMonth: integer(object.dayOfMonth, "dayOfMonth", 1, 31),
        hour: integer(object.hour, "hour", 0, 23),
        minute: integer(object.minute, "minute", 0, 59),
        invalidDayPolicy: enumValue(object.invalidDayPolicy, ["skip", "last_day"] as const, "invalidDayPolicy")
      };
    case "cron":
      return { type, expression: requiredString(object.expression, "expression", 200) };
  }
}

function parseNotificationPolicy(value: unknown): ScheduleNotificationPolicy {
  const object = objectValue(value, "notificationPolicy");
  const channelsRaw = object.channels;
  if (!Array.isArray(channelsRaw) || channelsRaw.length === 0) {
    invalid("TEST_SCHEDULE_NOTIFICATION_CHANNEL_REQUIRED", "알림 채널을 한 개 이상 선택해 주세요.");
  }
  const allowedChannels = ["in_app", "email", "slack"] as const;
  const channels = channelsRaw.map((channel) => {
    if (typeof channel !== "string" || !allowedChannels.includes(channel as typeof allowedChannels[number])) {
      invalid("NOTIFICATION_CHANNEL_INVALID", "지원하지 않는 알림 채널입니다.");
    }
    return channel as typeof allowedChannels[number];
  });
  const policy = {
    notifyOnSuccess: booleanValue(object.notifyOnSuccess, "notifyOnSuccess"),
    notifyOnFailure: booleanValue(object.notifyOnFailure, "notifyOnFailure"),
    notifyOnPartialSuccess: booleanValue(object.notifyOnPartialSuccess, "notifyOnPartialSuccess"),
    notifyOnRegression: booleanValue(object.notifyOnRegression, "notifyOnRegression"),
    notifyOnScheduleError: booleanValue(object.notifyOnScheduleError, "notifyOnScheduleError"),
    channels: [...new Set(channels)]
  };
  if (!policy.notifyOnSuccess && !policy.notifyOnFailure && !policy.notifyOnPartialSuccess && !policy.notifyOnRegression && !policy.notifyOnScheduleError) {
    invalid("TEST_SCHEDULE_NOTIFICATION_CONDITION_REQUIRED", "알림 조건을 한 개 이상 선택해 주세요.");
  }
  return policy;
}

function parseEmailTargets(value: unknown): EmailNotificationTargetInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const object = objectValue(entry, `emailTargets[${index}]`);
    const email = requiredString(object.email, "email", 320).toLowerCase();
    if (!EMAIL.test(email)) invalid("NOTIFICATION_EMAIL_INVALID", `올바르지 않은 이메일 주소입니다: ${email}`);
    return { email, enabled: booleanValue(object.enabled, "enabled") };
  });
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid("TEST_SCHEDULE_VALIDATION_FAILED", `${field}는 객체여야 합니다.`);
  return value as Record<string, unknown>;
}
function requiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > max) invalid("TEST_SCHEDULE_VALIDATION_FAILED", `${field} 값을 확인해 주세요.`);
  return value.trim();
}
function optionalString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, field, max);
}
function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") invalid("TEST_SCHEDULE_VALIDATION_FAILED", `${field}는 boolean이어야 합니다.`);
  return value;
}
function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) invalid("TEST_SCHEDULE_INVALID_CONFIG", `${field}는 ${min}~${max} 범위의 정수여야 합니다.`);
  return value as number;
}
function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) invalid("TEST_SCHEDULE_VALIDATION_FAILED", `${field} 값이 올바르지 않습니다.`);
  return value as T[number];
}
function scheduleTypeValue(value: unknown): typeof TYPES[number] {
  if (typeof value !== "string" || !TYPES.includes(value as typeof TYPES[number])) {
    invalid("TEST_SCHEDULE_INVALID_TYPE", "지원하지 않는 예약 일정 유형입니다.");
  }
  return value as typeof TYPES[number];
}
function invalid(code: string, message: string): never {
  throw new AppError(400, code, message);
}
