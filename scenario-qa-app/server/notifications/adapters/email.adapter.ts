import nodemailer from "nodemailer";
import type { NotificationRuntimeConfig } from "../utils/notification-config.js";

export class NotificationDeliveryError extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean) {
    super(message);
  }
}

export class EmailNotificationAdapter {
  constructor(private readonly config: NotificationRuntimeConfig) {}

  async send(input: { to: string; subject: string; text: string }): Promise<void> {
    if (this.config.emailProvider !== "smtp") {
      throw new NotificationDeliveryError("NOTIFICATION_PROVIDER_NOT_CONFIGURED", "SMTP 이메일 제공자가 설정되지 않았습니다.", false);
    }
    if (!this.config.smtpHost || !this.config.emailFrom) {
      throw new NotificationDeliveryError("NOTIFICATION_PROVIDER_NOT_CONFIGURED", "SMTP_HOST와 NOTIFICATION_EMAIL_FROM을 설정해 주세요.", false);
    }
    const transport = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpSecure,
      ...(this.config.smtpUser ? { auth: { user: this.config.smtpUser, pass: this.config.smtpPassword } } : {})
    });
    try {
      await transport.sendMail({ from: this.config.emailFrom, to: input.to, subject: input.subject, text: input.text });
    } catch (error: unknown) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "SMTP_SEND_FAILED";
      const retryable = !["EAUTH", "EENVELOPE", "EMESSAGE"].includes(code);
      throw new NotificationDeliveryError(code, "이메일 전송에 실패했습니다.", retryable);
    }
  }
}
