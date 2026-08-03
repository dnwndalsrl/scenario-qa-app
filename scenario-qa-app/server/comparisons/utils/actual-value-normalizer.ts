import type { JsonValue } from "../../../shared/types/test-run.js";
import { sanitizeLogMessage } from "../../ai/utils/log-sanitizer.js";
import { sanitizeUrl } from "../../ai/utils/url-sanitizer.js";

const DYNAMIC_KEY_PATTERN = /^(?:timestamp|time|createdAt|updatedAt|startedAt|finishedAt|runId|executionId|requestId|sessionId|nonce|token)$/i;

export function normalizeJsonValue(value: JsonValue): JsonValue {
  if (typeof value === "string") {
    return normalizeDynamicString(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          DYNAMIC_KEY_PATTERN.test(key)
            ? "[DYNAMIC]"
            : normalizeJsonValue(value[key] as JsonValue)
        ])
    );
  }
  return value;
}

export function normalizeDynamicString(value: string): string {
  const sanitized = sanitizeLogMessage(value, 2000)
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, "[TIMESTAMP]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[UUID]")
    .replace(/\b(?:run|execution|request|session)[-_][A-Za-z0-9_-]{8,}\b/gi, "[DYNAMIC_ID]")
    .replace(/\b[0-9a-f]{24,}\b/gi, "[DYNAMIC_HASH]")
    .replace(/\b\d{10,}\b/g, "[DYNAMIC_NUMBER]")
    .replace(/\s+/g, " ")
    .trim();
  if (/^https?:\/\//i.test(sanitized) || sanitized.startsWith("/")) {
    return sanitizeUrl(sanitized);
  }
  return sanitized;
}

export function stableStringify(value: JsonValue | undefined): string {
  return JSON.stringify(value === undefined ? null : normalizeJsonValue(value));
}
