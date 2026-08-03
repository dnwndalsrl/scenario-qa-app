import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AppError } from "../../utils/api.js";

const PREFIX = "v1";

export function validateSlackWebhookUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw invalidWebhook();
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "hooks.slack.com" ||
    !url.pathname.startsWith("/services/") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw invalidWebhook();
  }
  return url.toString();
}

export function encryptSecret(value: string, keyMaterial: string): string {
  if (keyMaterial.trim().length < 16) {
    throw new AppError(
      503,
      "NOTIFICATION_ENCRYPTION_KEY_MISSING",
      "Slack 알림을 사용하려면 16자 이상의 NOTIFICATION_ENCRYPTION_KEY가 필요합니다."
    );
  }
  const key = createHash("sha256").update(keyMaterial).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv, tag, encrypted]
    .map((part) => typeof part === "string" ? part : part.toString("base64url"))
    .join(":");
}

export function decryptSecret(value: string, keyMaterial: string): string {
  const [prefix, ivValue, tagValue, encryptedValue] = value.split(":");
  if (!prefix || prefix !== PREFIX || !ivValue || !tagValue || !encryptedValue) {
    throw secretUnavailable();
  }
  try {
    const key = createHash("sha256").update(keyMaterial).digest();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivValue, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw secretUnavailable();
  }
}

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function invalidWebhook(): AppError {
  return new AppError(
    400,
    "NOTIFICATION_SLACK_WEBHOOK_INVALID",
    "Slack Incoming Webhook URL(hooks.slack.com/services/...)을 확인해 주세요."
  );
}

function secretUnavailable(): AppError {
  return new AppError(
    500,
    "NOTIFICATION_SECRET_UNAVAILABLE",
    "저장된 알림 비밀값을 복호화할 수 없습니다. 암호화 키를 확인해 주세요."
  );
}
