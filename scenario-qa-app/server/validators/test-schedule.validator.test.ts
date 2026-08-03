import { describe, expect, it } from "vitest";
import { parseTestScheduleInput } from "./test-schedule.validator.js";

const valid = {
  suiteId: "suite-1", name: "매일 점검", status: "active", scheduleType: "daily",
  timezone: "Asia/Seoul", scheduleConfig: { type: "daily", hour: 9, minute: 0 },
  concurrencyPolicy: "skip", missedRunPolicy: "run_once",
  notificationPolicy: {
    notifyOnSuccess: true, notifyOnFailure: true, notifyOnPartialSuccess: true,
    notifyOnRegression: true, notifyOnScheduleError: true, channels: ["in_app"]
  }, emailTargets: []
};

describe("test schedule validator", () => {
  it("parses a discriminated daily schedule", () => {
    expect(parseTestScheduleInput(valid, 5).scheduleConfig).toEqual({ type: "daily", hour: 9, minute: 0 });
  });
  it("rejects a config whose discriminator differs", () => {
    expect(() => parseTestScheduleInput({ ...valid, scheduleConfig: { type: "weekly", daysOfWeek: [1], hour: 9, minute: 0 } }, 5)).toThrow();
  });
  it("rejects invalid IANA timezone names", () => {
    expect(() => parseTestScheduleInput({ ...valid, timezone: "Mars/Olympus" }, 5)).toThrow();
  });
});
