export interface TestScheduleRuntimeConfig {
  enabled: boolean;
  tickIntervalMs: number;
  defaultTimezone: string;
  maxPerSuite: number;
  maxPerProject: number;
  minIntervalMinutes: number;
  version: string;
}

interface RuntimeConfigLike {
  testSchedulerEnabled?: boolean;
  testSchedulerTickIntervalMs?: number;
  testScheduleDefaultTimezone?: string;
  testScheduleMaxPerSuite?: number;
  testScheduleMaxPerProject?: number;
  testScheduleMinIntervalMinutes?: number;
  testScheduleExecutionVersion?: string;
}

export function getTestScheduleConfig(
  config: RuntimeConfigLike
): TestScheduleRuntimeConfig {
  return {
    enabled: config.testSchedulerEnabled ?? true,
    tickIntervalMs: config.testSchedulerTickIntervalMs ?? 15_000,
    defaultTimezone: config.testScheduleDefaultTimezone ?? "Asia/Seoul",
    maxPerSuite: config.testScheduleMaxPerSuite ?? 10,
    maxPerProject: config.testScheduleMaxPerProject ?? 100,
    minIntervalMinutes: config.testScheduleMinIntervalMinutes ?? 15,
    version: config.testScheduleExecutionVersion ?? "v1"
  };
}
