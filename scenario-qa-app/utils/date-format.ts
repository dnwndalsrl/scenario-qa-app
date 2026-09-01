const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });
const dateFormatter = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

export function formatKoreanDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

export function formatKoreanDate(value: string): string {
  return dateFormatter.format(new Date(value));
}
