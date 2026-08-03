export function useNotificationDeliveries(executionId?: MaybeRefOrGetter<string | undefined>) {
  const request = useApiRequest<NotificationDelivery[]>();
  const execute = (): Promise<NotificationDelivery[] | null> => request.execute(() => {
    const id = executionId === undefined ? undefined : toValue(executionId);
    return apiFetch<ApiResponse<NotificationDelivery[]>>(id ? `/api/test-schedule-executions/${id}/notification-deliveries` : "/api/notification-deliveries");
  });
  async function retryNotificationDelivery(deliveryId: string): Promise<NotificationDelivery | null> {
    const mutation = useApiRequest<NotificationDelivery>();
    const result = await mutation.execute(() => apiFetch<ApiResponse<NotificationDelivery>>(`/api/notification-deliveries/${deliveryId}/retry`, { method: "POST" }));
    if (result === null) request.error.value = mutation.error.value;
    return result;
  }
  return { ...request, execute, refresh: execute, retryNotificationDelivery };
}
