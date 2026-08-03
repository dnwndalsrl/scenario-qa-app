export default defineNuxtRouteMiddleware(async (to) => {
  const projectId = to.params.projectId;
  if (typeof projectId !== "string" || projectId.length === 0) {
    return;
  }

  try {
    const requestFetch = useRequestFetch();
    await requestFetch<ApiResponse<TestProject>>(
      `/api/projects/${encodeURIComponent(projectId)}`
    );
  } catch {
    return navigateTo("/projects", { replace: true });
  }
});
