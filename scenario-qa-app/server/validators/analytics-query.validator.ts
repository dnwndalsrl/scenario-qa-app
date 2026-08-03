import { z } from "zod";
import type { AnalyticsBucketUnit, AnalyticsFilters } from "../../shared/types/analytics.js";
import type { AnalyticsConfig } from "../analytics/utils/analytics-config.js";
import { automaticBucketUnit, resolveDateRange, type ResolvedDateRange } from "../analytics/utils/date-range.js";
import { AppError } from "../utils/api.js";

export interface AnalyticsQuery extends ResolvedDateRange {
  filters: AnalyticsFilters;
  bucketUnit: AnalyticsBucketUnit;
}

const schema = z.object({
  startDate: z.string().min(1), endDate: z.string().min(1), timezone: z.string().min(1),
  trigger: z.enum(["all", "manual", "schedule"]).default("all"),
  scenarioId: z.string().min(1).optional(), suiteId: z.string().min(1).optional(),
  scheduleId: z.string().min(1).optional(), environmentName: z.string().min(1).optional(),
  bucketUnit: z.enum(["hour", "day", "week", "month"]).optional()
});

export function parseAnalyticsQuery(raw: Record<string, unknown>, config: AnalyticsConfig): AnalyticsQuery {
  const normalized = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const parsed = schema.safeParse(normalized);
  if (!parsed.success) throw new AppError(400, "QUERY_INVALID", "분석 조회 조건을 확인해 주세요.");
  const range = resolveDateRange({ startDate: parsed.data.startDate, endDate: parsed.data.endDate, timezone: parsed.data.timezone, maxDays: config.maxRangeDays });
  const bucketUnit = parsed.data.bucketUnit ?? automaticBucketUnit(range.startMs, range.endMs);
  return {
    ...range, bucketUnit,
    filters: {
      trigger: parsed.data.trigger,
      scenarioId: parsed.data.scenarioId ?? null,
      suiteId: parsed.data.suiteId ?? null,
      scheduleId: parsed.data.scheduleId ?? null,
      environmentName: parsed.data.environmentName ?? null
    }
  };
}
