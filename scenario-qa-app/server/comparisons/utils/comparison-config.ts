import type { RuntimeConfig } from "nuxt/schema";
import type { ComparisonConfig } from "../types/test-run-comparison.js";

export function getComparisonConfig(config: RuntimeConfig): ComparisonConfig {
  return {
    algorithmVersion: String(config.testRunComparisonVersion),
    durationWarningRate: Number(config.regressionDurationWarningRate),
    durationCriticalRate: Number(config.regressionDurationCriticalRate),
    durationMinDifferenceMs: Number(config.regressionDurationMinDifferenceMs),
    durationCriticalDifferenceMs: Number(
      config.regressionDurationCriticalDifferenceMs
    ),
    stepMatchMinConfidence: Number(config.regressionStepMatchMinConfidence),
    maxConsoleItems: Number(config.regressionMaxConsoleItems),
    maxNetworkItems: Number(config.regressionMaxNetworkItems)
  };
}
