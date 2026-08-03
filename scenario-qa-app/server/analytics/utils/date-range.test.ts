import { describe, expect, it } from "vitest";
import { automaticBucketUnit, resolveDateRange } from "./date-range.js";

describe("analytics date range", () => {
  it("converts local calendar boundaries to UTC and creates an equal previous period", () => {
    const result = resolveDateRange({ startDate: "2026-08-01", endDate: "2026-08-02", timezone: "Asia/Seoul", maxDays: 730 });
    expect(result.period.startDate).toBe("2026-07-31T15:00:00.000Z"); expect(result.period.endDate).toBe("2026-08-02T14:59:59.999Z");
    expect(result.endMs - result.startMs).toBe(result.previousEndMs - result.previousStartMs);
  });
  it("selects bucket granularity from the requested duration", () => { expect(automaticBucketUnit(0, 86_400_000 - 1)).toBe("hour"); expect(automaticBucketUnit(0, 30 * 86_400_000 - 1)).toBe("day"); expect(automaticBucketUnit(0, 200 * 86_400_000)).toBe("week"); expect(automaticBucketUnit(0, 400 * 86_400_000)).toBe("month"); });
  it("rejects invalid timezones and oversized periods", () => {
    expect(() => resolveDateRange({ startDate: "2026-01-01", endDate: "2026-01-02", timezone: "Mars/Base", maxDays: 730 })).toThrow();
    expect(() => resolveDateRange({ startDate: "2020-01-01", endDate: "2026-01-02", timezone: "UTC", maxDays: 30 })).toThrow();
  });
});
