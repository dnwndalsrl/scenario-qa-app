import { sanitizeLogMessage } from "../ai/utils/log-sanitizer.js";

type Level = "info" | "warn" | "error";
export function operationalLog(level: Level, event: string, fields: Record<string, unknown>): void {
  const safe = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, sanitizeValue(value)]));
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...safe });
  if (level === "error") console.error(line); else if (level === "warn") console.warn(line); else console.info(line);
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value !== "string") return typeof value === "number" || typeof value === "boolean" || value === null ? value : "[omitted]";
  let safe = sanitizeLogMessage(value, 500);
  for (const [name, secret] of Object.entries(process.env)) if (secret !== undefined && secret.length >= 4 && /(PASSWORD|TOKEN|SECRET|COOKIE|AUTH|API_KEY|PRIVATE_KEY|LOGIN_ID|ADMIN_ID|USERNAME)/i.test(name)) safe = safe.replaceAll(secret, "[REDACTED]");
  return safe;
}
