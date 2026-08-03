export function useTestRunComparisons() {
  const request = useApiRequest<TestRunComparison[]>();

  async function create(
    input: TestRunComparisonRequest
  ): Promise<TestRunComparisonAccepted | null> {
    const mutation = useApiRequest<TestRunComparisonAccepted>();
    const result = await mutation.execute(() =>
      apiFetch<ApiResponse<TestRunComparisonAccepted>>(
        "/api/test-run-comparisons",
        { method: "POST", body: input }
      )
    );
    if (result === null) request.error.value = mutation.error.value;
    return result;
  }

  async function get(id: string): Promise<TestRunComparison | null> {
    const detail = useApiRequest<TestRunComparison>();
    const result = await detail.execute(() =>
      apiFetch<ApiResponse<TestRunComparison>>(
        `/api/test-run-comparisons/${id}`
      )
    );
    if (result === null) request.error.value = detail.error.value;
    return result;
  }

  async function listByScenario(
    projectId: string,
    scenarioId: string
  ): Promise<TestRunComparison[] | null> {
    return request.execute(() =>
      apiFetch<ApiResponse<TestRunComparison[]>>(
        `/api/projects/${projectId}/scenarios/${scenarioId}/comparisons`
      )
    );
  }

  async function listByRun(runId: string): Promise<TestRunComparison[] | null> {
    return request.execute(() =>
      apiFetch<ApiResponse<TestRunComparison[]>>(
        `/api/test-runs/${runId}/comparisons`
      )
    );
  }

  return { ...request, create, get, listByScenario, listByRun };
}

const ACTIVE_COMPARISON_STATUSES = new Set<TestRunComparisonStatus>([
  "pending",
  "processing"
]);

export function useComparisonPolling(
  comparisonId: MaybeRefOrGetter<string>
) {
  const runtimeConfig = useRuntimeConfig();
  const comparisons = useTestRunComparisons();
  const comparison = shallowRef<TestRunComparison | null>(null);
  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref<string | null>(null);
  const timedOut = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let startedAt = 0;
  let stopped = false;

  const isActive = computed(
    () =>
      comparison.value !== null &&
      ACTIVE_COMPARISON_STATUSES.has(comparison.value.status)
  );

  async function fetchComparison(background = false): Promise<void> {
    if (inFlight || stopped) return;
    inFlight = true;
    if (background) refreshing.value = true;
    else loading.value = true;
    const value = await comparisons.get(toValue(comparisonId));
    inFlight = false;
    loading.value = false;
    refreshing.value = false;
    if (value === null) {
      error.value = comparisons.error.value ?? "비교 결과를 불러오지 못했습니다.";
      stop();
      return;
    }
    comparison.value = value;
    error.value = null;
    if (!ACTIVE_COMPARISON_STATUSES.has(value.status)) {
      stopTimer();
      return;
    }
    schedule();
  }

  function schedule(): void {
    stopTimer();
    if (stopped || !isActive.value) return;
    if (Date.now() - startedAt >= Number(runtimeConfig.public.pollingTimeoutMs)) {
      timedOut.value = true;
      error.value = "비교 상태 자동 갱신 시간이 초과되었습니다. 새로고침해 주세요.";
      return;
    }
    timer = setTimeout(
      () => void fetchComparison(true),
      Number(runtimeConfig.public.pollingIntervalMs)
    );
  }

  function stopTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function start(): void {
    stopped = false;
    timedOut.value = false;
    startedAt = Date.now();
    void fetchComparison();
  }

  function stop(): void {
    stopped = true;
    stopTimer();
  }

  async function refresh(): Promise<void> {
    stopped = false;
    timedOut.value = false;
    startedAt = Date.now();
    await fetchComparison();
  }

  onBeforeUnmount(stop);
  return {
    comparison,
    loading,
    refreshing,
    error,
    timedOut,
    isActive,
    start,
    stop,
    refresh
  };
}
