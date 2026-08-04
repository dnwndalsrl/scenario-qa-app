export function useApiLoading() {
  const pendingCount = useState<number>("api-pending-count", () => 0);
  const isLoading = computed(() => pendingCount.value > 0);

  return { pendingCount, isLoading };
}
