import type {
  ConsoleLogEntry,
  NetworkErrorEntry
} from "../../../shared/types/test-run.js";
import { sanitizeUrl } from "./url-sanitizer.js";

export interface SanitizedConsoleEntry {
  type: string;
  message: string;
  timestamp: string;
  count: number;
}

export interface SanitizedNetworkEntry {
  method: string;
  url: string;
  status: number | null;
  resourceType: string;
  failureText: string | null;
  timestamp: string;
  count: number;
}

export function sanitizeLogMessage(
  value: string,
  maxLength: number
): string {
  let sanitized = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_API_KEY]")
    .replace(
      /\b(?:eyJ[A-Za-z0-9_-]{8,})\.(?:[A-Za-z0-9_-]{8,})\.(?:[A-Za-z0-9_-]{8,})\b/g,
      "[REDACTED_TOKEN]"
    )
    .replace(
      /\b(authorization|cookie|set-cookie|password|비밀번호|access[_ -]?token|refresh[_ -]?token|api[_ -]?key|secret|session[_ -]?id)\s*[:=]\s*([^\s,;]+)/gi,
      "$1=[REDACTED]"
    )
    .replace(/\b\d{6}-?[1-4]\d{6}\b/g, "[REDACTED_ID]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_NUMBER]")
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[REDACTED_EMAIL]"
    )
    .replace(/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/g, "[REDACTED_PHONE]")
    .replace(/[A-Za-z]:\\(?:[^\s:]+\\)*[^\s:]+/g, "[내부 경로]")
    .replace(/\b(?:\/home|\/Users|\/var\/app|\/workspace)\/[^\s]+/g, "[내부 경로]");

  sanitized = sanitized.replace(/https?:\/\/[^\s"')]+/gi, (url) =>
    sanitizeUrl(url)
  );
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  if (sanitized.length <= maxLength) {
    return sanitized;
  }
  return `${sanitized.slice(0, Math.max(0, maxLength - 12))}…[잘림]`;
}

export function normalizeConsoleLogs(
  logs: ConsoleLogEntry[],
  maxItems: number,
  maxMessageLength: number
): SanitizedConsoleEntry[] {
  const merged = new Map<string, SanitizedConsoleEntry>();
  for (const log of logs) {
    const message = sanitizeLogMessage(log.text, maxMessageLength);
    if (message.length === 0) {
      continue;
    }
    const key = `${log.type}\u0000${message}`;
    const current = merged.get(key);
    if (current === undefined) {
      merged.set(key, {
        type: log.type.slice(0, 30),
        message,
        timestamp: log.timestamp,
        count: 1
      });
    } else {
      current.count += 1;
    }
  }
  return [...merged.values()]
    .sort((left, right) => consoleRank(left.type) - consoleRank(right.type))
    .slice(0, maxItems);
}

export function normalizeNetworkErrors(
  errors: NetworkErrorEntry[],
  maxItems: number,
  maxMessageLength: number
): SanitizedNetworkEntry[] {
  const merged = new Map<string, SanitizedNetworkEntry>();
  for (const item of errors) {
    const normalized: SanitizedNetworkEntry = {
      method: item.method.slice(0, 20).toUpperCase(),
      url: sanitizeUrl(item.url),
      status: item.status,
      resourceType: item.resourceType.slice(0, 50),
      failureText:
        item.failureText === null
          ? null
          : sanitizeLogMessage(item.failureText, maxMessageLength),
      timestamp: item.timestamp,
      count: 1
    };
    const key = [
      normalized.method,
      normalized.url,
      normalized.status ?? "failed",
      normalized.failureText ?? "",
      normalized.resourceType
    ].join("\u0000");
    const current = merged.get(key);
    if (current === undefined) {
      merged.set(key, normalized);
    } else {
      current.count += 1;
    }
  }
  return [...merged.values()]
    .sort((left, right) => networkRank(left) - networkRank(right))
    .slice(0, maxItems);
}

function consoleRank(type: string): number {
  if (type.toLowerCase() === "error") {
    return 0;
  }
  if (type.toLowerCase() === "warning") {
    return 1;
  }
  return 2;
}

function networkRank(item: SanitizedNetworkEntry): number {
  const resourcePenalty = ["image", "font", "media"].includes(
    item.resourceType.toLowerCase()
  )
    ? 10
    : 0;
  if (item.status !== null && item.status >= 500) {
    return resourcePenalty;
  }
  if (item.status !== null && item.status >= 400) {
    return 1 + resourcePenalty;
  }
  return 2 + resourcePenalty;
}

