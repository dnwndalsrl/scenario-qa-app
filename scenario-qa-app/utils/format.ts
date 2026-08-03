export function formatDateTime(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "기록 없음";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "알 수 없음";
  }
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) {
    return "-";
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}초`;
}

export function formatJsonValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return typeof value === "string"
    ? value
    : JSON.stringify(value, null, 2);
}
