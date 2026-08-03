export function useScenarios(projectId: MaybeRefOrGetter<string>) {
  const request = useApiRequest<ScenarioSummary[]>();
  const id = (): string => toValue(projectId);
  const basePath = (): string => `/api/projects/${id()}/scenarios`;

  const execute = (): Promise<ScenarioSummary[] | null> =>
    request.execute(() =>
      apiFetch<ApiResponse<ScenarioSummary[]>>(basePath())
    );

  async function get(scenarioId: string): Promise<TestScenario | null> {
    const single = useApiRequest<TestScenario>();
    const result = await single.execute(() =>
      apiFetch<ApiResponse<TestScenario>>(`${basePath()}/${scenarioId}`)
    );
    if (result === null && single.error.value !== null) {
      request.error.value = single.error.value;
    }
    return result;
  }

  async function create(
    input: ScenarioInput,
    aiConversion?: AiScenarioSaveMetadata
  ): Promise<TestScenario | null> {
    const mutation = useApiRequest<TestScenario>();
    const result = await mutation.execute(() =>
      apiFetch<ApiResponse<TestScenario>>(basePath(), {
        method: "POST",
        body: {
          ...input,
          ...(aiConversion === undefined ? {} : { aiConversion })
        }
      })
    );
    if (result === null) {
      request.error.value = mutation.error.value;
    }
    return result;
  }

  async function update(
    scenarioId: string,
    input: ScenarioInput
  ): Promise<TestScenario | null> {
    const mutation = useApiRequest<TestScenario>();
    const result = await mutation.execute(() =>
      apiFetch<ApiResponse<TestScenario>>(`${basePath()}/${scenarioId}`, {
        method: "PUT",
        body: input
      })
    );
    if (result === null) {
      request.error.value = mutation.error.value;
    }
    return result;
  }

  async function remove(scenarioId: string): Promise<boolean> {
    const mutation = useApiRequest<{ deleted: boolean }>();
    const result = await mutation.execute(() =>
      apiFetch<ApiResponse<{ deleted: boolean }>>(
        `${basePath()}/${scenarioId}`,
        { method: "DELETE" }
      )
    );
    if (result === null) {
      request.error.value = mutation.error.value;
    }
    return result?.deleted === true;
  }

  return {
    ...request,
    execute,
    refresh: execute,
    get,
    create,
    update,
    remove
  };
}
