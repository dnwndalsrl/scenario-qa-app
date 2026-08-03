import { describe, expect, it } from "vitest";
import { durationStatistics, percentile, safeRate } from "./statistics.js";

describe("analytics statistics", () => {
  it("returns null instead of zero when a rate has no denominator", () => { expect(safeRate(0, 0)).toBeNull(); expect(safeRate(0, 3)).toBe(0); });
  it("calculates interpolated percentiles and duration statistics", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(durationStatistics([100, 200, 300, 400])).toEqual({ count: 4, averageMs: 250, medianMs: 250, minMs: 100, maxMs: 400, p95Ms: 385 });
  });
  it("keeps missing durations distinguishable", () => { expect(durationStatistics([]).averageMs).toBeNull(); });
});
