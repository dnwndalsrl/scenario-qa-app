import path from "node:path";
import { requireAuthConfiguration } from "../auth/auth.js";

export default defineNitroPlugin(() => {
  if (process.env.NODE_ENV !== "production") return;

  const errors: string[] = [];
  const warnings: string[] = [];
  const appBaseUrl = process.env.APP_BASE_URL?.trim() ?? "";
  const storageRoot = process.env.NUXT_STORAGE_ROOT?.trim() ?? "";

  if (appBaseUrl.length === 0) {
    errors.push("APP_BASE_URL is required in production.");
  } else {
    try {
      const parsed = new URL(appBaseUrl);
      if (parsed.protocol !== "https:" && process.env.DEPLOYMENT_ALLOW_INSECURE_HTTP !== "true") {
        errors.push("APP_BASE_URL must use HTTPS in production.");
      }
    } catch {
      errors.push("APP_BASE_URL must be an absolute URL.");
    }
  }

  if (storageRoot.length === 0 || !path.isAbsolute(storageRoot)) {
    errors.push("NUXT_STORAGE_ROOT must be an absolute path in production.");
  }
  if (process.env.ALLOW_LOCAL_TEST_TARGETS === "true") {
    errors.push("ALLOW_LOCAL_TEST_TARGETS must be false in production.");
  }
  if (process.env.APP_DEPLOYMENT_MODE === "free_sandbox" && process.env.APP_AUTH_ENABLED !== "true") {
    errors.push("APP_AUTH_ENABLED must be true in free_sandbox mode.");
  }
  try { requireAuthConfiguration(); } catch (error) {
    errors.push(error instanceof Error ? error.message : "Application authentication configuration is invalid.");
  }

  const timezone = process.env.TEST_SCHEDULE_DEFAULT_TIMEZONE ?? "Asia/Seoul";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    errors.push("TEST_SCHEDULE_DEFAULT_TIMEZONE is not a valid IANA timezone.");
  }

  if ((process.env.NOTIFICATION_EMAIL_PROVIDER ?? "disabled") === "smtp") {
    for (const name of ["NOTIFICATION_EMAIL_FROM", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"] as const) {
      if ((process.env[name] ?? "").trim().length === 0) errors.push(`${name} is required when SMTP notifications are enabled.`);
    }
  }
  if (process.env.NOTIFICATION_SLACK_ENABLED === "true" && (process.env.NOTIFICATION_ENCRYPTION_KEY ?? "").length < 32) {
    errors.push("NOTIFICATION_ENCRYPTION_KEY must contain at least 32 characters when Slack notifications are enabled.");
  }

  const aiModelsConfigured = Boolean(process.env.OPENAI_SCENARIO_MODEL || process.env.OPENAI_FAILURE_ANALYSIS_MODEL);
  if (aiModelsConfigured && !process.env.OPENAI_API_KEY) {
    warnings.push("OpenAI models are configured without OPENAI_API_KEY; AI features will be unavailable.");
  }

  for (const warning of warnings) console.warn(`[environment] ${warning}`);
  if (errors.length > 0) {
    throw new Error(`Invalid production environment:\n- ${errors.join("\n- ")}`);
  }
});
