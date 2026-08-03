const ACTIVE_SUITE_RUN_STATUSES = new Set<TestSuiteRunStatus>([
  "pending",
  "running"
]);

export function useTestSuiteRunPolling(
  suiteRunId: MaybeRefOrGetter<string>
) {
  const runtime = useRuntimeConfig();
  const suiteRun = useTestSuiteRun(suiteRunId);
  const detail = shallowRef<TestSuiteRunDetail | null>(null);
  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref<string | null>(null);
  const timedOut = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;
  let stopped = false;
  let inFlight = false;

  const isActive = computed(
    () =>
      detail.value !== null &&
      ACTIVE_SUITE_RUN_STATUSES.has(detail.value.run.status)
  );

  function stopTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function stop(): void {
    stopped = true;
    stopTimer();
  }

  function schedule(): void {
    stopTimer();
    if (stopped || !isActive.value) return;
    if (
      Date.now() - startedAt >=
      Number(runtime.public.testSuitePollingTimeoutMs)
    ) {
      timedOut.value = true;
      error.value = "자동 갱신 시간이 초과되었습니다. 수동 새로고침으로 상태를 확인해 주세요.";
      return;
    }
    timer = setTimeout(() => void fetchDetail(true), Number(runtime.public.testSuitePollingIntervalMs));
  }

  async function fetchDetail(background = false): Promise<void> {
    if (inFlight || stopped) return;
    inFlight = true;
    if (background) refreshing.value = true;
    else loading.value = true;
    const value = await suiteRun.execute();
    inFlight = false;
    refreshing.value = false;
    loading.value = false;
    if (value === null) {
      error.value = suiteRun.error.value ?? "스위트 실행 결과를 불러오지 못했습니다.";
      stop();
      return;
    }
    detail.value = value;
    error.value = null;
    if (ACTIVE_SUITE_RUN_STATUSES.has(value.run.status)) schedule();
    else stopTimer();
  }

  function start(): void {
    stopped = false;
    timedOut.value = false;
    startedAt = Date.now();
    void fetchDetail();
  }

  async function refresh(): Promise<void> {
    stopped = false;
    timedOut.value = false;
    startedAt = Date.now();
    await fetchDetail();
  }

  onBeforeUnmount(stop);
  return { detail, loading, refreshing, error, timedOut, isActive, start, stop, refresh };
}
