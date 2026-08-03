export interface NotificationRuntimeConfig {
  appBaseUrl: string;
  emailProvider: "disabled" | "smtp";
  emailFrom: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  encryptionKey: string;
  maxRetryCount: number;
  retryDelaysMs: number[];
}

interface RuntimeConfigLike {
  appBaseUrl?: string;
  notificationEmailProvider?: string;
  notificationEmailFrom?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  notificationEncryptionKey?: string;
  notificationMaxRetryCount?: number;
  notificationRetryDelayMs?: number;
}

export function getNotificationConfig(
  config: RuntimeConfigLike
): NotificationRuntimeConfig {
  return {
    appBaseUrl: config.appBaseUrl ?? "http://127.0.0.1:3100",
    emailProvider: config.notificationEmailProvider === "smtp" ? "smtp" : "disabled",
    emailFrom: config.notificationEmailFrom ?? "",
    smtpHost: config.smtpHost ?? "",
    smtpPort: config.smtpPort ?? 587,
    smtpSecure: config.smtpSecure ?? false,
    smtpUser: config.smtpUser ?? "",
    smtpPassword: config.smtpPassword ?? "",
    encryptionKey: config.notificationEncryptionKey ?? "",
    maxRetryCount: config.notificationMaxRetryCount ?? 3,
    retryDelaysMs: Array.from(
      { length: config.notificationMaxRetryCount ?? 3 },
      (_, index) => (config.notificationRetryDelayMs ?? 5_000) * 2 ** index
    )
  };
}
