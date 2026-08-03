import { describe, expect, it } from "vitest";
import { compareMetric } from "./metric-comparator.js";
describe("metric comparison", () => {
  it("uses favorable direction metadata", () => { expect(compareMetric(0.9, 0.8, "higher").direction).toBe("improved"); expect(compareMetric(0.1, 0.05, "lower").direction).toBe("degraded"); });
  it("does not invent comparisons for missing values or a zero baseline rate", () => { expect(compareMetric(null, 0, "higher").direction).toBe("not_comparable"); expect(compareMetric(1, 0, "higher").changeRate).toBeNull(); });
});
