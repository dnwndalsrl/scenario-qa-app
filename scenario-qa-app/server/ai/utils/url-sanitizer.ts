const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "code",
  "password",
  "secret",
  "key",
  "api_key",
  "apikey",
  "session",
  "session_id",
  "email",
  "phone"
]);

export function sanitizeUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }
  try {
    const absolute = new URL(trimmed);
    absolute.username = "";
    absolute.password = "";
    redactQuery(absolute);
    absolute.hash = "";
    return absolute.toString().slice(0, 2048);
  } catch {
    try {
      const relative = new URL(trimmed, "http://analysis.local");
      redactQuery(relative);
      relative.hash = "";
      return `${relative.pathname}${relative.search}`.slice(0, 2048);
    } catch {
      return "[유효하지 않은 URL]";
    }
  }
}

export function sanitizeOrigin(value: string): string {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return "[알 수 없는 origin]";
  }
}

function redactQuery(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      url.searchParams.set(key, "[REDACTED]");
    }
  }
}

