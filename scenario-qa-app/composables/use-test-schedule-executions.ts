export function useTestScheduleExecutions(projectId: MaybeRefOrGetter<string>, scheduleId: MaybeRefOrGetter<string>) {
  const request = useApiRequest<TestScheduleExecution[]>();
  const basePath = (): string => `/api/projects/${toValue(projectId)}/test-schedules/${toValue(scheduleId)}/executions`;
  const execute = (): Promise<TestScheduleExecution[] | null> => request.execute(() => apiFetch<ApiResponse<TestScheduleExecution[]>>(basePath()));
  async function get(executionId: string): Promise<TestScheduleExecutionDetail | null> {
    const detail = useApiRequest<TestScheduleExecutionDetail>();
    const result = await detail.execute(() => apiFetch<ApiResponse<TestScheduleExecutionDetail>>(`${basePath()}/${executionId}`));
    if (result === null) request.error.value = detail.error.value;
    return result;
  }
  return { ...request, execute, refresh: execute, get };
}
