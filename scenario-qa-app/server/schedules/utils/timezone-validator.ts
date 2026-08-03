import { DateTime, IANAZone } from "luxon";
import { AppError } from "../../utils/api.js";

export function isValidTimezone(timezone: string): boolean {
  return timezone.trim().length > 0 && IANAZone.isValidZone(timezone);
}

export function assertValidTimezone(timezone: string): void {
  if (!isValidTimezone(timezone)) {
    throw new AppError(
      400,
      "TEST_SCHEDULE_INVALID_TIMEZONE",
      "존재하는 IANA 타임존을 입력해 주세요. 예: Asia/Seoul"
    );
  }
}

export function formatInTimezone(iso: string, timezone: string): string {
  return DateTime.fromISO(iso, { setZone: true })
    .setZone(timezone)
    .setLocale("ko")
    .toFormat("yyyy년 M월 d일 cccc a h:mm");
}
