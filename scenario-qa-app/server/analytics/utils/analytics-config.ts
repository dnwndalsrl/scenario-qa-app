export interface AnalyticsConfig {
  version: string;
  defaultRangeDays: number;
  maxRangeDays: number;
  cacheTtlMs: number;
  maxTimeseriesPoints: number;
  topScenariosLimit: number;
  topStepsLimit: number;
  topErrorsLimit: number;
  recentIssuesLimit: number;
  minSampleForTrend: number;
  successWarning: number;
  successDanger: number;
  regressionWarning: number;
  regressionDanger: number;
  errorWarning: number;
  errorDanger: number;
}

export function getAnalyticsConfig(runtimeConfig: Record<string, unknown>): AnalyticsConfig {
  return {
    version: String(runtimeConfig.analyticsVersion ?? "v1"),
    defaultRangeDays: numberValue(runtimeConfig.analyticsDefaultRangeDays, 30),
    maxRangeDays: numberValue(runtimeConfig.analyticsMaxRangeDays, 730),
    cacheTtlMs: numberValue(runtimeConfig.analyticsCacheTtlMs, 60_000),
    maxTimeseriesPoints: numberValue(runtimeConfig.analyticsMaxTimeseriesPoints, 400),
    topScenariosLimit: numberValue(runtimeConfig.analyticsTopScenariosLimit, 20),
    topStepsLimit: numberValue(runtimeConfig.analyticsTopStepsLimit, 20),
    topErrorsLimit: numberValue(runtimeConfig.analyticsTopErrorsLimit, 20),
    recentIssuesLimit: numberValue(runtimeConfig.analyticsRecentIssuesLimit, 20),
    minSampleForTrend: numberValue(runtimeConfig.analyticsMinSampleForTrend, 5),
    successWarning: rateValue(runtimeConfig.analyticsSuccessWarning, 0.95),
    successDanger: rateValue(runtimeConfig.analyticsSuccessDanger, 0.8),
    regressionWarning: rateValue(runtimeConfig.analyticsRegressionWarning, 0.05),
    regressionDanger: rateValue(runtimeConfig.analyticsRegressionDanger, 0.15),
    errorWarning: rateValue(runtimeConfig.analyticsErrorWarning, 0.02),
    errorDanger: rateValue(runtimeConfig.analyticsErrorDanger, 0.1)
  };
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
function rateValue(value: unknown, fallback: number): number {
  return typeof value === "number" && value >= 0 && value <= 1 ? value : fallback;
}
