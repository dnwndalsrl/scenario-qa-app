import { DateTime } from "luxon";
import type { AnalyticsBucketUnit, AnalyticsPeriod } from "../../../shared/types/analytics.js";
import { AppError } from "../../utils/api.js";

export interface ResolvedDateRange {
  period: AnalyticsPeriod;
  startMs: number;
  endMs: number;
  previousStartMs: number;
  previousEndMs: number;
}

export function resolveDateRange(input: {
  startDate: string;
  endDate: string;
  timezone: string;
  maxDays: number;
}): ResolvedDateRange {
  const zoneProbe = DateTime.now().setZone(input.timezone);
  if (!zoneProbe.isValid) throw new AppError(400, "INVALID_TIMEZONE", "유효하지 않은 시간대입니다.");
  const start = parseBoundary(input.startDate, input.timezone, "start");
  const end = parseBoundary(input.endDate, input.timezone, "end");
  if (!start.isValid || !end.isValid || end.toMillis() < start.toMillis()) {
    throw new AppError(400, "INVALID_DATE_RANGE", "조회 시작일과 종료일을 확인해 주세요.");
  }
  const durationMs = end.toMillis() - start.toMillis() + 1;
  if (durationMs > input.maxDays * 86_400_000) {
    throw new AppError(400, "DATE_RANGE_TOO_LARGE", `조회 기간은 최대 ${input.maxDays}일입니다.`);
  }
  const previousEndMs = start.toMillis() - 1;
  const previousStartMs = previousEndMs - durationMs + 1;
  return {
    startMs: start.toMillis(),
    endMs: end.toMillis(),
    previousStartMs,
    previousEndMs,
    period: {
      startDate: start.toUTC().toISO() ?? "",
      endDate: end.toUTC().toISO() ?? "",
      timezone: input.timezone,
      previousStartDate: DateTime.fromMillis(previousStartMs).toUTC().toISO() ?? "",
      previousEndDate: DateTime.fromMillis(previousEndMs).toUTC().toISO() ?? ""
    }
  };
}

function parseBoundary(value: string, timezone: string, boundary: "start" | "end"): DateTime {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = dateOnly
    ? DateTime.fromISO(value, { zone: timezone })
    : DateTime.fromISO(value, { setZone: true }).setZone(timezone);
  return dateOnly ? (boundary === "start" ? parsed.startOf("day") : parsed.endOf("day")) : parsed;
}

export function automaticBucketUnit(startMs: number, endMs: number): AnalyticsBucketUnit {
  const days = (endMs - startMs + 1) / 86_400_000;
  if (days <= 1) return "hour";
  if (days <= 90) return "day";
  if (days <= 365) return "week";
  return "month";
}
