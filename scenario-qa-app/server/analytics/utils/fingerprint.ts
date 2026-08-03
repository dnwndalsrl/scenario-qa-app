import { createHash } from "node:crypto";

export function sanitizeAnalyticsMessage(value: string | null | undefined): string {
  return (value ?? "알 수 없는 오류")
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .replace(/[A-Za-z]:\\[^\s]+|\/(?:[^\s/]+\/)+[^\s]+/g, "[path]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[id]")
    .replace(/\b\d{4,}\b/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function errorFingerprint(kind: string, message: string | null | undefined): string {
  const normalized = sanitizeAnalyticsMessage(message).toLowerCase();
  return createHash("sha256").update(`${kind}:${normalized}`).digest("hex").slice(0, 20);
}
