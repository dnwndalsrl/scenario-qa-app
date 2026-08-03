import { describe, expect, it } from "vitest";
import { determineQualityStatus } from "./quality-status.js";
import type { AnalyticsConfig } from "./analytics-config.js";
const config: AnalyticsConfig = { version: "v1", defaultRangeDays: 30, maxRangeDays: 730, cacheTtlMs: 60_000, maxTimeseriesPoints: 400, topScenariosLimit: 20, topStepsLimit: 20, topErrorsLimit: 20, recentIssuesLimit: 20, minSampleForTrend: 5, successWarning: .95, successDanger: .8, regressionWarning: .05, regressionDanger: .15, errorWarning: .02, errorDanger: .1 };
describe("quality status", () => {
  it("requires a minimum completed sample", () => { expect(determineQualityStatus({ completedRuns: 4, successRate: 1, regressionRate: 0, errorRate: 0 }, config).state).toBe("insufficient"); });
  it("uses deterministic danger thresholds", () => { expect(determineQualityStatus({ completedRuns: 10, successRate: .79, regressionRate: 0, errorRate: 0 }, config).state).toBe("danger"); });
  it("reports healthy only when every available metric is within bounds", () => { expect(determineQualityStatus({ completedRuns: 10, successRate: .99, regressionRate: .01, errorRate: 0 }, config).state).toBe("healthy"); });
});
