import type { JsonValue } from "../types/result.js";

const SENSITIVE_QUERY_KEY =
  /^(password|passwd|pwd|token|access_token|refresh_token|secret|api_key|key|authorization|cookie)$/i;

export function redactText(
  input: string,
  sensitiveValues: readonly string[]
): string {
  let redacted = input;
  for (const value of sensitiveValues) {
    if (value.length > 0) {
      redacted = redacted.replaceAll(value, "[REDACTED]");
    }
  }

  return redacted
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(
      /((?:password|passwd|pwd|token|secret|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]"
    );
}

export function redactUrl(
  input: string,
  sensitiveValues: readonly string[]
): string {
  const textRedacted = redactText(input, sensitiveValues);
  try {
    const parsed = new URL(textRedacted);
    parsed.username = "";
    parsed.password = "";

    for (const [key] of parsed.searchParams) {
      if (SENSITIVE_QUERY_KEY.test(key)) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }
    return parsed.toString();
  } catch {
    return textRedacted;
  }
}

export function redactJsonValue(
  input: JsonValue,
  sensitiveValues: readonly string[]
): JsonValue {
  if (typeof input === "string") {
    return redactText(input, sensitiveValues);
  }
  if (Array.isArray(input)) {
    return input.map((value) => redactJsonValue(value, sensitiveValues));
  }
  if (typeof input === "object" && input !== null) {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        redactJsonValue(value, sensitiveValues)
      ])
    );
  }
  return input;
}
