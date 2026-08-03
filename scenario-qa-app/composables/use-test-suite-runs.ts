export function useTestSuiteRuns(filters: {
  projectId?: MaybeRefOrGetter<string | undefined>;
  suiteId?: MaybeRefOrGetter<string | undefined>;
} = {}) {
  const request = useApiRequest<TestSuiteRun[]>();
  const execute = (): Promise<TestSuiteRun[] | null> =>
    request.execute(() =>
      apiFetch<ApiResponse<TestSuiteRun[]>>("/api/test-suite-runs", {
        query: {
          projectId:
            filters.projectId === undefined ? undefined : toValue(filters.projectId),
          suiteId:
            filters.suiteId === undefined ? undefined : toValue(filters.suiteId)
        }
      })
    );

  async function create(
    input: TestSuiteRunRequest
  ): Promise<TestSuiteRunAccepted | null> {
    const mutation = useApiRequest<TestSuiteRunAccepted>();
    const result = await mutation.execute(() =>
      apiFetch<ApiResponse<TestSuiteRunAccepted>>("/api/test-suite-runs", {
        method: "POST",
        body: input
      })
    );
    if (result === null) request.error.value = mutation.error.value;
    return result;
  }

  return { ...request, execute, refresh: execute, create };
}
