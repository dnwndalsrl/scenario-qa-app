import { CronExpressionParser } from "cron-parser";
import { DateTime } from "luxon";
import type {
  SchedulePreviewResult,
  TestScheduleConfig
} from "../../../shared/types/test-schedule.js";
import { AppError } from "../../utils/api.js";
import {
  assertValidTimezone,
  formatInTimezone
} from "./timezone-validator.js";

const MAX_SEARCH_DAYS = 370;
const MAX_SEARCH_MONTHS = 120;

export function calculateNextRunAt(
  config: TestScheduleConfig,
  timezone: string,
  baseTime: string | Date = new Date()
): string | undefined {
  assertValidTimezone(timezone);
  const base = toUtcDateTime(baseTime);
  if (!base.isValid) {
    throw invalidConfig("기준 시간이 올바르지 않습니다.");
  }
  switch (config.type) {
    case "once":
      return calculateOnce(config.runAt, timezone, base);
    case "daily":
      return calculateDaily(config.hour, config.minute, timezone, base);
    case "weekly":
      return calculateWeekly(
        config.daysOfWeek,
        config.hour,
        config.minute,
        timezone,
        base
      );
    case "monthly":
      return calculateMonthly(config, timezone, base);
    case "cron":
      return calculateCron(config.expression, timezone, base);
  }
}

export function previewSchedule(
  config: TestScheduleConfig,
  timezone: string,
  baseTime: string | Date = new Date(),
  count = 5
): SchedulePreviewResult {
  const occurrences: SchedulePreviewResult["occurrences"] = [];
  let cursor = toUtcDateTime(baseTime);
  for (let index = 0; index < count; index += 1) {
    const next = calculateNextRunAt(config, timezone, cursor.toJSDate());
    if (next === undefined) break;
    occurrences.push({
      runAt: next,
      localDisplayTime: formatInTimezone(next, timezone)
    });
    cursor = DateTime.fromISO(next, { zone: "utc" }).plus({ milliseconds: 1 });
    if (config.type === "once") break;
  }
  const first = occurrences[0];
  return {
    ...(first === undefined
      ? { reason: "기준 시간 이후의 실행 일정이 없습니다." }
      : {
          nextRunAt: first.runAt,
          localDisplayTime: first.localDisplayTime
        }),
    occurrences,
    summary: summarizeSchedule(config)
  };
}

export function assertCronInterval(
  expression: string,
  timezone: string,
  minimumMinutes: number,
  baseTime: string | Date = new Date()
): void {
  assertCronExpression(expression, timezone, baseTime);
  const parsed = CronExpressionParser.parse(expression, {
    currentDate: toUtcDateTime(baseTime).toJSDate(),
    tz: timezone
  });
  const occurrences = parsed.take(100).map((date) => date.toDate().getTime());
  for (let index = 1; index < occurrences.length; index += 1) {
    const previous = occurrences[index - 1];
    const current = occurrences[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      current - previous < minimumMinutes * 60_000
    ) {
      throw new AppError(
        400,
        "TEST_SCHEDULE_INTERVAL_TOO_SHORT",
        `Cron 실행 간격은 ${minimumMinutes}분 이상이어야 합니다. 실행 간격을 늘려 주세요.`
      );
    }
  }
}

export function assertCronExpression(
  expression: string,
  timezone: string,
  baseTime: string | Date = new Date()
): void {
  if (expression.trim().split(/\s+/).length !== 5) {
    throw new AppError(
      400,
      "TEST_SCHEDULE_INVALID_CRON",
      "Cron은 초 필드가 없는 5개 필드 형식으로 입력해 주세요."
    );
  }
  try {
    CronExpressionParser.parse(expression, {
      currentDate: toUtcDateTime(baseTime).toJSDate(),
      tz: timezone
    }).next();
  } catch {
    throw new AppError(
      400,
      "TEST_SCHEDULE_INVALID_CRON",
      "Cron 표현식을 해석할 수 없습니다. 분 시 일 월 요일 순서를 확인해 주세요."
    );
  }
}

export function mostRecentDueOccurrence(
  config: TestScheduleConfig,
  timezone: string,
  firstDueAt: string,
  now: string
): string {
  if (config.type === "once") return firstDueAt;
  let latest = firstDueAt;
  let cursor = DateTime.fromISO(firstDueAt, { zone: "utc" }).plus({ milliseconds: 1 });
  for (let index = 0; index < 400; index += 1) {
    const next = calculateNextRunAt(config, timezone, cursor.toJSDate());
    if (next === undefined || next > now) break;
    latest = next;
    cursor = DateTime.fromISO(next, { zone: "utc" }).plus({ milliseconds: 1 });
  }
  return latest;
}

export function summarizeSchedule(config: TestScheduleConfig): string {
  const time = (hour: number, minute: number): string =>
    `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  switch (config.type) {
    case "once":
      return `한 번 · ${config.runAt}`;
    case "daily":
      return `매일 ${time(config.hour, config.minute)}`;
    case "weekly":
      return `매주 ${config.daysOfWeek.map(dayLabel).join(", ")} ${time(config.hour, config.minute)}`;
    case "monthly":
      return `매월 ${config.dayOfMonth}일 ${time(config.hour, config.minute)} · ${config.invalidDayPolicy === "last_day" ? "월말 보정" : "없는 날짜 건너뜀"}`;
    case "cron":
      return `Cron ${config.expression}`;
  }
}

function calculateOnce(
  runAt: string,
  timezone: string,
  base: DateTime
): string | undefined {
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(runAt);
  const parsed = DateTime.fromISO(runAt, {
    zone: hasExplicitZone ? undefined : timezone,
    setZone: hasExplicitZone
  });
  if (!parsed.isValid) throw invalidConfig("일회성 실행 날짜와 시간을 확인해 주세요.");
  const utc = parsed.toUTC();
  return utc > base ? utc.toISO() ?? undefined : undefined;
}

function calculateDaily(
  hour: number,
  minute: number,
  timezone: string,
  base: DateTime
): string {
  assertClock(hour, minute);
  const localBase = base.setZone(timezone);
  for (let offset = 0; offset < MAX_SEARCH_DAYS; offset += 1) {
    const day = localBase.startOf("day").plus({ days: offset });
    const candidate = DateTime.fromObject(
      { year: day.year, month: day.month, day: day.day, hour, minute },
      { zone: timezone }
    );
    if (candidate.isValid && candidate.toUTC() > base) return toIso(candidate);
  }
  throw nextRunFailed();
}

function calculateWeekly(
  daysOfWeek: number[],
  hour: number,
  minute: number,
  timezone: string,
  base: DateTime
): string {
  assertClock(hour, minute);
  if (
    daysOfWeek.length === 0 ||
    new Set(daysOfWeek).size !== daysOfWeek.length ||
    daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw invalidConfig("요일은 0(일요일)부터 6(토요일) 사이에서 선택해 주세요.");
  }
  const allowed = new Set(daysOfWeek);
  const localBase = base.setZone(timezone);
  for (let offset = 0; offset < MAX_SEARCH_DAYS; offset += 1) {
    const day = localBase.startOf("day").plus({ days: offset });
    const sundayBased = day.weekday % 7;
    if (!allowed.has(sundayBased)) continue;
    const candidate = DateTime.fromObject(
      { year: day.year, month: day.month, day: day.day, hour, minute },
      { zone: timezone }
    );
    if (candidate.isValid && candidate.toUTC() > base) return toIso(candidate);
  }
  throw nextRunFailed();
}

function calculateMonthly(
  config: Extract<TestScheduleConfig, { type: "monthly" }>,
  timezone: string,
  base: DateTime
): string {
  assertClock(config.hour, config.minute);
  if (!Number.isInteger(config.dayOfMonth) || config.dayOfMonth < 1 || config.dayOfMonth > 31) {
    throw invalidConfig("매월 실행일은 1일부터 31일 사이여야 합니다.");
  }
  const localBase = base.setZone(timezone);
  for (let offset = 0; offset < MAX_SEARCH_MONTHS; offset += 1) {
    const month = localBase.startOf("month").plus({ months: offset });
    const daysInMonth = month.daysInMonth;
    if (daysInMonth === undefined) continue;
    if (config.dayOfMonth > daysInMonth && config.invalidDayPolicy === "skip") continue;
    const day = Math.min(config.dayOfMonth, daysInMonth);
    const candidate = DateTime.fromObject(
      {
        year: month.year,
        month: month.month,
        day,
        hour: config.hour,
        minute: config.minute
      },
      { zone: timezone }
    );
    if (candidate.isValid && candidate.toUTC() > base) return toIso(candidate);
  }
  throw nextRunFailed();
}

function calculateCron(
  expression: string,
  timezone: string,
  base: DateTime
): string {
  assertCronExpression(expression, timezone, base.toJSDate());
  try {
    return CronExpressionParser.parse(expression, {
      currentDate: base.toJSDate(),
      tz: timezone
    }).next().toDate().toISOString();
  } catch {
    throw nextRunFailed();
  }
}

function assertClock(hour: number, minute: number): void {
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    throw invalidConfig("시간은 0~23시, 분은 0~59분 범위여야 합니다.");
  }
}

function toUtcDateTime(value: string | Date): DateTime {
  return value instanceof Date
    ? DateTime.fromJSDate(value, { zone: "utc" })
    : DateTime.fromISO(value, { zone: "utc" });
}

function toIso(value: DateTime): string {
  const iso = value.toUTC().toISO();
  if (iso === null) throw nextRunFailed();
  return iso;
}

function invalidConfig(message: string): AppError {
  return new AppError(400, "TEST_SCHEDULE_INVALID_CONFIG", message);
}

function nextRunFailed(): AppError {
  return new AppError(
    400,
    "TEST_SCHEDULE_NEXT_RUN_FAILED",
    "다음 실행 시간을 계산하지 못했습니다. 일정 설정을 확인해 주세요."
  );
}

function dayLabel(day: number): string {
  return ["일", "월", "화", "수", "목", "금", "토"][day] ?? "?";
}
