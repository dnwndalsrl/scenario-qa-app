import type { DurationStatistics } from "../../../shared/types/analytics.js";

export function safeRate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = Math.max(0, Math.min(1, percentileValue)) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower] ?? null;
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (rank - lower);
}

export function durationStatistics(values: number[]): DurationStatistics {
  const valid = values.filter((value) => Number.isFinite(value) && value >= 0);
  if (valid.length === 0) {
    return { count: 0, averageMs: null, medianMs: null, minMs: null, maxMs: null, p95Ms: null };
  }
  const total = valid.reduce((sum, value) => sum + value, 0);
  return {
    count: valid.length,
    averageMs: total / valid.length,
    medianMs: percentile(valid, 0.5),
    minMs: Math.min(...valid),
    maxMs: Math.max(...valid),
    p95Ms: percentile(valid, 0.95)
  };
}
