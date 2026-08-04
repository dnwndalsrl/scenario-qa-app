const SENSITIVE_QUERY = /^(token|access_token|api_?key|key|secret|password|passwd|authorization|auth|session|cookie)$/i;

export function sanitizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) if (SENSITIVE_QUERY.test(key)) url.searchParams.set(key, "[REDACTED]");
    url.username = ""; url.password = ""; url.hash = "";
    return url.toString();
  } catch { return raw.slice(0, 500); }
}

export function sanitizeText(value: string, maxLength = 300): string {
  return value.replace(/(bearer\s+)[a-z0-9._-]+/gi, "$1[REDACTED]").replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "$1=[REDACTED]").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
