export function useProjects() {
  const request = useApiRequest<ProjectSummary[]>();

  const execute = (): Promise<ProjectSummary[] | null> =>
    request.execute(() =>
      apiFetch<ApiResponse<ProjectSummary[]>>("/api/projects")
    );

  async function get(projectId: string): Promise<TestProject | null> {
    return useApiRequest<TestProject>().execute(() =>
      apiFetch<ApiResponse<TestProject>>(`/api/projects/${projectId}`)
    );
  }

  async function create(input: ProjectInput): Promise<TestProject | null> {
    return useApiRequest<TestProject>().execute(() =>
      apiFetch<ApiResponse<TestProject>>("/api/projects", {
        method: "POST",
        body: input
      })
    );
  }

  async function update(
    projectId: string,
    input: ProjectInput
  ): Promise<TestProject | null> {
    return useApiRequest<TestProject>().execute(() =>
      apiFetch<ApiResponse<TestProject>>(`/api/projects/${projectId}`, {
        method: "PUT",
        body: input
      })
    );
  }

  async function remove(projectId: string): Promise<boolean> {
    const result = await useApiRequest<{ deleted: boolean }>().execute(() =>
      apiFetch<ApiResponse<{ deleted: boolean }>>(`/api/projects/${projectId}`, {
        method: "DELETE"
      })
    );
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
