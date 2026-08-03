export function useTestSchedules(projectId: MaybeRefOrGetter<string>) {
  const request = useApiRequest<TestSchedule[]>();
  const basePath = (): string => `/api/projects/${toValue(projectId)}/test-schedules`;

  const execute = (): Promise<TestSchedule[] | null> => request.execute(() => apiFetch<ApiResponse<TestSchedule[]>>(basePath()));

  async function get(scheduleId: string): Promise<TestScheduleDetail | null> {
    const detail = useApiRequest<TestScheduleDetail>();
    const result = await detail.execute(() => apiFetch<ApiResponse<TestScheduleDetail>>(`${basePath()}/${scheduleId}`));
    if (result === null) request.error.value = detail.error.value;
    return result;
  }

  async function create(input: TestScheduleInput): Promise<TestSchedule | null> {
    return mutate<TestSchedule>(basePath(), "POST", input);
  }
  async function update(scheduleId: string, input: TestScheduleInput): Promise<TestSchedule | null> {
    return mutate<TestSchedule>(`${basePath()}/${scheduleId}`, "PUT", input);
  }
  async function remove(scheduleId: string): Promise<boolean> {
    const result = await mutate<{ deleted: boolean }>(`${basePath()}/${scheduleId}`, "DELETE");
    return result?.deleted === true;
  }
  async function setStatus(scheduleId: string, status: "active" | "inactive"): Promise<TestSchedule | null> {
    return mutate<TestSchedule>(`${basePath()}/${scheduleId}/${status === "active" ? "activate" : "deactivate"}`, "POST");
  }
  async function runNow(scheduleId: string): Promise<TestScheduleExecution | null> {
    return mutate<TestScheduleExecution>(`${basePath()}/${scheduleId}/run-now`, "POST");
  }
  async function preview(input: Pick<TestScheduleInput, "scheduleType" | "scheduleConfig" | "timezone">): Promise<SchedulePreviewResult | null> {
    return mutate<SchedulePreviewResult>(`/api/test-schedules/preview`, "POST", input);
  }

  async function mutate<T>(url: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<T | null> {
    const mutation = useApiRequest<T>();
    const result = await mutation.execute(() => apiFetch<ApiResponse<T>>(url, { method, ...(body === undefined ? {} : { body }) }));
    if (result === null) request.error.value = mutation.error.value;
    return result;
  }

  return { ...request, execute, refresh: execute, get, create, update, remove, setStatus, runNow, preview };
}
