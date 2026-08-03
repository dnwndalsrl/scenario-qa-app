import { NotificationDeliveryError } from "./email.adapter.js";

export class SlackNotificationAdapter {
  async send(webhookUrl: string, text: string): Promise<void> {
    let response: Response;
    try {
      response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        redirect: "manual",
        signal: AbortSignal.timeout(10_000)
      });
    } catch {
      throw new NotificationDeliveryError("SLACK_NETWORK_ERROR", "Slack 연결에 실패했습니다.", true);
    }
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new NotificationDeliveryError(`SLACK_HTTP_${response.status}`, "Slack 알림 전송에 실패했습니다.", retryable);
    }
  }
}
