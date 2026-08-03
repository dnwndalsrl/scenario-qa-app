type AnalyticsEndpointData = {
  summary: AnalyticsSummaryResponse;
  timeseries: AnalyticsTimeseriesResponse;
  scenarios: AnalyticsListResponse<ScenarioAnalyticsItem>;
  suites: AnalyticsListResponse<SuiteAnalyticsItem>;
  schedules: AnalyticsListResponse<ScheduleAnalyticsItem>;
  "failing-steps": AnalyticsListResponse<FailingStepAnalyticsItem>;
  errors: AnalyticsListResponse<ErrorFrequencyItem>;
  "recent-issues": AnalyticsListResponse<RecentIssueItem>;
};

export function useProjectAnalytics(projectId: Ref<string>) {
  const resources = {
    summary: useApiRequest<AnalyticsEndpointData["summary"]>(),
    timeseries: useApiRequest<AnalyticsEndpointData["timeseries"]>(),
    scenarios: useApiRequest<AnalyticsEndpointData["scenarios"]>(),
    suites: useApiRequest<AnalyticsEndpointData["suites"]>(),
    schedules: useApiRequest<AnalyticsEndpointData["schedules"]>(),
    "failing-steps": useApiRequest<AnalyticsEndpointData["failing-steps"]>(),
    errors: useApiRequest<AnalyticsEndpointData["errors"]>(),
    "recent-issues": useApiRequest<AnalyticsEndpointData["recent-issues"]>()
  };

  async function load(query: Record<string, string>): Promise<void> {
    await Promise.all(Object.entries(resources).map(async ([endpoint, resource]) => {
      await resource.execute(() => apiFetch<ApiResponse<AnalyticsEndpointData[keyof AnalyticsEndpointData]>>(
        `/api/projects/${projectId.value}/analytics/${endpoint}`, { query }
      ) as Promise<ApiResponse<never>>);
    }));
  }

  return { resources, load };
}
