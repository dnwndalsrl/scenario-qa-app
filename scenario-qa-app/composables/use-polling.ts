const ACTIVE_RUN_STATUSES = new Set<TestRunStatus>(["pending", "running"]);

export function useRunPolling(runId: MaybeRefOrGetter<string>) {
  const runtimeConfig = useRuntimeConfig();
  const runs = useTestRuns();
  const detail = shallowRef<TestRunDetail | null>(null);
  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref<string | null>(null);
  const timedOut = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let requestInFlight = false;
  let pollingStartedAt = 0;
  let stopped = false;

  const intervalMs = Number(runtimeConfig.public.pollingIntervalMs);
  const timeoutMs = Number(runtimeConfig.public.pollingTimeoutMs);
  const isActive = computed(
    () =>
      detail.value !== null &&
      ACTIVE_RUN_STATUSES.has(detail.value.run.status)
  );

  async function fetchDetail(background = false): Promise<void> {
    if (requestInFlight || stopped) {
      return;
    }
    requestInFlight = true;
    if (background) {
      refreshing.value = true;
    } else {
      loading.value = true;
    }

    const value = await runs.get(toValue(runId));
    requestInFlight = false;
    loading.value = false;
    refreshing.value = false;

    if (value === null) {
      error.value = runs.error.value ?? "실행 결과를 불러오지 못했습니다.";
      stop();
      return;
    }
    detail.value = value;
    error.value = null;

    if (!ACTIVE_RUN_STATUSES.has(value.run.status)) {
      stopTimer();
      return;
    }
    scheduleNext();
  }

  function scheduleNext(): void {
    stopTimer();
    if (stopped || !isActive.value) {
      return;
    }
    if (Date.now() - pollingStartedAt >= timeoutMs) {
      timedOut.value = true;
      error.value =
        "자동 갱신 시간이 초과되었습니다. 새로고침하여 상태를 다시 확인해 주세요.";
      return;
    }
    timer = setTimeout(() => {
      void fetchDetail(true);
    }, intervalMs);
  }

  function stopTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function start(): void {
    stopped = false;
    timedOut.value = false;
    pollingStartedAt = Date.now();
    void fetchDetail(false);
  }

  function stop(): void {
    stopped = true;
    stopTimer();
  }

  async function refresh(): Promise<void> {
    stopped = false;
    timedOut.value = false;
    pollingStartedAt = Date.now();
    await fetchDetail(false);
  }

  onBeforeUnmount(stop);

  return {
    detail,
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
