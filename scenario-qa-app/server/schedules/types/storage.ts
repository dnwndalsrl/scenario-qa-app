import type {
  EmailNotificationTargetInput,
  TestSchedule
} from "../../../shared/types/test-schedule.js";

export interface StoredTestSchedule extends Omit<
  TestSchedule,
  "emailTargets" | "slackConfigured" | "suiteName"
> {
  emailTargets: EmailNotificationTargetInput[];
  slackWebhookEncrypted?: string;
}
