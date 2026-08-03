import { describe, expect, it } from "vitest";
import type { AnalyticsConfig } from "../analytics/utils/analytics-config.js";
import { parseAnalyticsQuery } from "./analytics-query.validator.js";
const config: AnalyticsConfig = { version: "v1", defaultRangeDays: 30, maxRangeDays: 730, cacheTtlMs: 60_000, maxTimeseriesPoints: 400, topScenariosLimit: 20, topStepsLimit: 20, topErrorsLimit: 20, recentIssuesLimit: 20, minSampleForTrend: 5, successWarning: .95, successDanger: .8, regressionWarning: .05, regressionDanger: .15, errorWarning: .02, errorDanger: .1 };
describe("analytics query integration", () => {
  it("normalizes common filters and automatically selects a bucket", () => { const query = parseAnalyticsQuery({ startDate: "2026-07-01", endDate: "2026-07-30", timezone: "Asia/Seoul", trigger: "schedule", scenarioId: "scenario-1" }, config); expect(query.filters).toMatchObject({ trigger: "schedule", scenarioId: "scenario-1", suiteId: null }); expect(query.bucketUnit).toBe("day"); });
  it("rejects unknown query enums", () => { expect(() => parseAnalyticsQuery({ startDate: "2026-07-01", endDate: "2026-07-30", timezone: "UTC", trigger: "robot" }, config)).toThrow(); });
});
