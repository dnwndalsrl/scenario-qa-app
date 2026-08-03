export function useTestSuiteRun(suiteRunId: MaybeRefOrGetter<string>) {
  const request = useApiRequest<TestSuiteRunDetail>();
  const execute = (): Promise<TestSuiteRunDetail | null> =>
    request.execute(() =>
      apiFetch<ApiResponse<TestSuiteRunDetail>>(
        `/api/test-suite-runs/${toValue(suiteRunId)}`
      )
    );
  return { ...request, execute, refresh: execute };
}
