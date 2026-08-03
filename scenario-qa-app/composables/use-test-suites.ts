export function useTestSuites(projectId: MaybeRefOrGetter<string>) {
  const request = useApiRequest<TestSuiteSummary[]>();
  const id = (): string => toValue(projectId);
  const basePath = (): string => `/api/projects/${id()}/test-suites`;

  const execute = (): Promise<TestSuiteSummary[] | null> =>
    request.execute(() => apiFetch<ApiResponse<TestSuiteSummary[]>>(basePath()));

  async function create(input: TestSuiteInput): Promise<TestSuite | null> {
    const mutation = useApiRequest<TestSuite>();
    const result = await mutation.execute(() =>
      apiFetch<ApiResponse<TestSuite>>(basePath(), { method: "POST", body: input })
    );
    if (result === null) request.error.value = mutation.error.value;
    return result;
  }

  async function update(
    suiteId: string,
    input: TestSuiteInput
  ): Promise<TestSuite | null> {
    const mutation = useApiRequest<TestSuite>();
    const result = await mutation.execute(() =>
      apiFetch<ApiResponse<TestSuite>>(`${basePath()}/${suiteId}`, {
        method: "PUT",
        body: input
      })
    );
    if (result === null) request.error.value = mutation.error.value;
    return result;
  }

  async function remove(suiteId: string): Promise<boolean> {
    const mutation = useApiRequest<{ deleted: boolean }>();
    const result = await mutation.execute(() =>
      apiFetch<ApiResponse<{ deleted: boolean }>>(`${basePath()}/${suiteId}`, {
        method: "DELETE"
      })
    );
    if (result === null) request.error.value = mutation.error.value;
    return result?.deleted === true;
  }

  return { ...request, execute, refresh: execute, create, update, remove };
}
