import type { PerformanceComparison } from "../../../shared/types/test-run-comparison.js";
import type {
  ComparisonConfig,
  DurationComparisonResult
} from "../types/test-run-comparison.js";

export function compareDuration(
  baselineDurationMs: number | undefined,
  comparisonDurationMs: number | undefined,
  config: ComparisonConfig
): DurationComparisonResult {
  if (
    baselineDurationMs === undefined ||
    comparisonDurationMs === undefined
  ) {
    return {
      ...(baselineDurationMs === undefined ? {} : { baselineDurationMs }),
      ...(comparisonDurationMs === undefined ? {} : { comparisonDurationMs }),
      change: "stable"
    };
  }
  const differenceMs = comparisonDurationMs - baselineDurationMs;
  const changeRate =
    baselineDurationMs > 0 ? differenceMs / baselineDurationMs : undefined;

  if (differenceMs < 0) {
    return {
      baselineDurationMs,
      comparisonDurationMs,
      differenceMs,
      ...(changeRate === undefined ? {} : { changeRate }),
      change: "improved"
    };
  }
  if (
    changeRate !== undefined &&
    changeRate >= config.durationCriticalRate &&
    differenceMs >= config.durationCriticalDifferenceMs
  ) {
    return {
      baselineDurationMs,
      comparisonDurationMs,
      differenceMs,
      changeRate,
      change: "critical_degraded"
    };
  }
  if (
    changeRate !== undefined &&
    changeRate >= config.durationWarningRate &&
    differenceMs >= config.durationMinDifferenceMs
  ) {
    return {
      baselineDurationMs,
      comparisonDurationMs,
      differenceMs,
      changeRate,
      change: "degraded"
    };
  }
  return {
    baselineDurationMs,
    comparisonDurationMs,
    differenceMs,
    ...(changeRate === undefined ? {} : { changeRate }),
    change: "stable"
  };
}

export function toPerformanceComparison(
  result: DurationComparisonResult,
  config: ComparisonConfig
): PerformanceComparison {
  return {
    ...result,
    warningRate: config.durationWarningRate,
    criticalRate: config.durationCriticalRate,
    minimumDifferenceMs: config.durationMinDifferenceMs,
    criticalDifferenceMs: config.durationCriticalDifferenceMs
  };
}
