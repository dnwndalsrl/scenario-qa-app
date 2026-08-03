export function useNotifications(projectId?: MaybeRefOrGetter<string | undefined>) {
  const request = useApiRequest<NotificationListResult>();
  const execute = (): Promise<NotificationListResult | null> => request.execute(() => {
    const id = projectId === undefined ? undefined : toValue(projectId);
    return apiFetch<ApiResponse<NotificationListResult>>("/api/notifications", { query: id ? { projectId: id } : {} });
  });
  async function markRead(notificationId: string): Promise<AppNotification | null> {
    const mutation = useApiRequest<AppNotification>();
    const result = await mutation.execute(() => apiFetch<ApiResponse<AppNotification>>(`/api/notifications/${notificationId}/read`, { method: "POST" }));
    if (result === null) request.error.value = mutation.error.value;
    return result;
  }
  async function markAllRead(id: string): Promise<boolean> {
    const mutation = useApiRequest<{ updatedCount: number }>();
    const result = await mutation.execute(() => apiFetch<ApiResponse<{ updatedCount: number }>>("/api/notifications/read-all", { method: "POST", body: { projectId: id } }));
    if (result === null) request.error.value = mutation.error.value;
    return result !== null;
  }
  return { ...request, execute, refresh: execute, markRead, markAllRead };
}
