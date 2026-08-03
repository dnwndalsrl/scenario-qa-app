import type { TestSuiteRunStatus } from "./test-suite.js";
import type { NotificationDelivery } from "./notification.js";

export type ScheduleType = "once" | "daily" | "weekly" | "monthly" | "cron";
export type ScheduleConcurrencyPolicy = "skip" | "queue_once";
export type MissedRunPolicy = "skip" | "run_once";
export type NotificationChannel = "in_app" | "email" | "slack";

export interface OnceScheduleConfig {
  type: "once";
  runAt: string;
}

export interface DailyScheduleConfig {
  type: "daily";
  hour: number;
  minute: number;
}

export interface WeeklyScheduleConfig {
  type: "weekly";
  daysOfWeek: number[];
  hour: number;
  minute: number;
}

export interface MonthlyScheduleConfig {
  type: "monthly";
  dayOfMonth: number;
  hour: number;
  minute: number;
  invalidDayPolicy: "skip" | "last_day";
}

export interface CronScheduleConfig {
  type: "cron";
  expression: string;
}

export type TestScheduleConfig =
  | OnceScheduleConfig
  | DailyScheduleConfig
  | WeeklyScheduleConfig
  | MonthlyScheduleConfig
  | CronScheduleConfig;

export interface ScheduleNotificationPolicy {
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  notifyOnPartialSuccess: boolean;
  notifyOnRegression: boolean;
  notifyOnScheduleError: boolean;
  channels: NotificationChannel[];
}

export interface MaskedEmailTarget {
  emailMasked: string;
  enabled: boolean;
}

export interface TestSchedule {
  id: string;
  projectId: string;
  suiteId: string;
  suiteName?: string;
  name: string;
  description?: string;
  status: "active" | "inactive";
  scheduleType: ScheduleType;
  timezone: string;
  scheduleConfig: TestScheduleConfig;
  concurrencyPolicy: ScheduleConcurrencyPolicy;
  missedRunPolicy: MissedRunPolicy;
  notificationPolicy: ScheduleNotificationPolicy;
  emailTargets: MaskedEmailTarget[];
  slackConfigured: boolean;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunStatus?: TestSuiteRunStatus;
  lastScheduleExecutionId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface EmailNotificationTargetInput {
  email: string;
  enabled: boolean;
}

export interface TestScheduleInput {
  suiteId: string;
  name: string;
  description?: string;
  status: "active" | "inactive";
  scheduleType: ScheduleType;
  timezone: string;
  scheduleConfig: TestScheduleConfig;
  concurrencyPolicy: ScheduleConcurrencyPolicy;
  missedRunPolicy: MissedRunPolicy;
  notificationPolicy: ScheduleNotificationPolicy;
  emailTargets: EmailNotificationTargetInput[];
  slackWebhookUrl?: string;
}

export interface NextRunCalculationResult {
  nextRunAt?: string;
  localDisplayTime?: string;
  reason?: string;
}

export interface SchedulePreviewResult extends NextRunCalculationResult {
  occurrences: Array<{ runAt: string; localDisplayTime: string }>;
  summary: string;
}

export interface TestScheduleSnapshot {
  scheduleName: string;
  suiteId: string;
  suiteName: string;
  timezone: string;
  scheduleType: ScheduleType;
  scheduleConfig: TestScheduleConfig;
  concurrencyPolicy: ScheduleConcurrencyPolicy;
  missedRunPolicy: MissedRunPolicy;
  notificationPolicy: ScheduleNotificationPolicy;
  capturedAt: string;
}

export type TestScheduleExecutionStatus =
  | "detected"
  | "queued"
  | "running"
  | "completed"
  | "skipped"
  | "failed";

export interface TestScheduleExecution {
  id: string;
  scheduleId: string;
  projectId: string;
  suiteId: string;
  status: TestScheduleExecutionStatus;
  trigger: "schedule" | "schedule_manual_trigger";
  scheduledFor: string;
  detectedAt: string;
  scheduleSnapshot: TestScheduleSnapshot;
  startedAt?: string;
  finishedAt?: string;
  suiteRunId?: string;
  suiteRunStatus?: TestSuiteRunStatus;
  regressionCount: number;
  comparisonIds: string[];
  skipReason?: string;
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestScheduleDetail {
  schedule: TestSchedule;
  executions: TestScheduleExecution[];
}

export interface TestScheduleExecutionDetail {
  execution: TestScheduleExecution;
  deliveries: NotificationDelivery[];
}
