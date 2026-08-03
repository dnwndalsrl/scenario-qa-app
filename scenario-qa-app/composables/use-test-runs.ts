export function useTestRuns(filters: {
  projectId?: MaybeRefOrGetter<string | undefined>;
  scenarioId?: MaybeRefOrGetter<string | undefined>;
} = {}) {
  const request = useApiRequest<TestRun[]>();

  const execute = (): Promise<TestRun[] | null> =>
    request.execute(() =>
      apiFetch<ApiResponse<TestRun[]>>("/api/test-runs", {
        query: {
          projectId:
            filters.projectId === undefined
              ? undefined
              : toValue(filters.projectId),
          scenarioId:
            filters.scenarioId === undefined
              ? undefined
              : toValue(filters.scenarioId)
        }
      })
    );

  async function get(runId: string): Promise<TestRunDetail | null> {
    const detail = useApiRequest<TestRunDetail>();
    const result = await detail.execute(() =>
      apiFetch<ApiResponse<TestRunDetail>>(`/api/test-runs/${runId}`)
    );
    if (result === null) {
      request.error.value = detail.error.value;
    }
    return result;
  }

  async function create(
    input: TestRunRequest
  ): Promise<TestRunAccepted | null> {
    const mutation = useApiRequest<TestRunAccepted>();
    const result = await mutation.execute(() =>
      apiFetch<ApiResponse<TestRunAccepted>>("/api/test-runs", {
        method: "POST",
        body: input
      })
    );
    if (result === null) {
      request.error.value = mutation.error.value;
    }
    return result;
  }

  async function retry(runId: string): Promise<TestRunAccepted | null> {
    const mutation = useApiRequest<TestRunAccepted>();
    const result = await mutation.execute(() =>
      apiFetch<ApiResponse<TestRunAccepted>>(`/api/test-runs/${runId}/retry`, {
        method: "POST"
      })
    );
    if (result === null) {
      request.error.value = mutation.error.value;
    }
    return result;
  }

  return {
    ...request,
    execute,
    refresh: execute,
    get,
    create,
    retry
  };
}
