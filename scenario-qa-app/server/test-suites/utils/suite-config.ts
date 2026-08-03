export interface TestSuiteConfig {
  maxItems: number;
  pollIntervalMs: number;
  maxExecutionMs: number;
  allowConcurrentRuns: boolean;
  version: string;
}

export function getTestSuiteConfig(
  runtime: Record<string, unknown>
): TestSuiteConfig {
  return {
    maxItems: numberValue(runtime.testSuiteMaxItems, 50),
    pollIntervalMs: numberValue(runtime.testSuitePollIntervalMs, 2000),
    maxExecutionMs: numberValue(runtime.testSuiteMaxExecutionMs, 1800000),
    allowConcurrentRuns: runtime.testSuiteAllowConcurrentRuns === true,
    version:
      typeof runtime.testSuiteRunVersion === "string" &&
      runtime.testSuiteRunVersion.trim().length > 0
        ? runtime.testSuiteRunVersion
        : "v1"
  };
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}
