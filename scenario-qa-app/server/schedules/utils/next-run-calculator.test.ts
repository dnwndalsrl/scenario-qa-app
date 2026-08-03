import { describe, expect, it } from "vitest";
import { AppError } from "../../utils/api.js";
import { assertCronInterval, calculateNextRunAt, previewSchedule } from "./next-run-calculator.js";

describe("next-run-calculator", () => {
  it("converts a Seoul daily schedule to UTC", () => {
    expect(calculateNextRunAt({ type: "daily", hour: 9, minute: 30 }, "Asia/Seoul", "2026-08-03T00:00:00.000Z"))
      .toBe("2026-08-03T00:30:00.000Z");
  });

  it("supports weekly and monthly last-day policies", () => {
    expect(calculateNextRunAt({ type: "weekly", daysOfWeek: [1], hour: 9, minute: 0 }, "UTC", "2026-08-03T09:00:00.000Z"))
      .toBe("2026-08-10T09:00:00.000Z");
    expect(calculateNextRunAt({ type: "monthly", dayOfMonth: 31, hour: 9, minute: 0, invalidDayPolicy: "last_day" }, "UTC", "2026-09-01T00:00:00.000Z"))
      .toBe("2026-09-30T09:00:00.000Z");
  });

  it("returns five preview occurrences for a recurring schedule", () => {
    const result = previewSchedule({ type: "cron", expression: "0 */6 * * *" }, "UTC", "2026-08-03T00:01:00.000Z");
    expect(result.occurrences).toHaveLength(5);
    expect(result.occurrences[0]?.runAt).toBe("2026-08-03T06:00:00.000Z");
  });

  it("rejects cron expressions below the configured minimum interval", () => {
    expect(() => assertCronInterval("*/2 * * * *", "UTC", 5)).toThrowError(AppError);
  });

  it("uses timezone rules across the spring DST transition", () => {
    const next = calculateNextRunAt({ type: "daily", hour: 2, minute: 30 }, "America/New_York", "2026-03-08T05:00:00.000Z");
    expect(next).toBe("2026-03-08T07:30:00.000Z");
  });
});
