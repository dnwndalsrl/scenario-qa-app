import type { MetricComparison } from "../../../shared/types/analytics.js";

export function compareMetric(
  current: number | null,
  previous: number | null,
  favorable: "higher" | "lower"
): MetricComparison {
  if (current === null || previous === null) {
    return { current, previous, difference: null, changeRate: null, direction: "not_comparable", favorable };
  }
  const difference = current - previous;
  const changeRate = previous === 0 ? null : difference / Math.abs(previous);
  const direction = difference === 0
    ? "unchanged"
    : (favorable === "higher" ? difference > 0 : difference < 0)
      ? "improved"
      : "degraded";
  return { current, previous, difference, changeRate, direction, favorable };
}
