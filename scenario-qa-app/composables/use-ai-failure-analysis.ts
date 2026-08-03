const ACTIVE_ANALYSIS_STATUSES = new Set<AiFailureAnalysisStatus>([
  "pending",
  "processing"
]);

export function useAiFailureAnalysis(
  runId: MaybeRefOrGetter<string>
) {
  const runtimeConfig = useRuntimeConfig();
  const analysis = shallowRef<AiFailureAnalysis | null>(null);
  const loading = ref(true);
  const refreshing = ref(false);
  const requesting = ref(false);
  const error = ref<string | null>(null);
  const timedOut = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pollingStartedAt = 0;
  let requestInFlight = false;
  let stopped = false;

  const intervalMs = Number(runtimeConfig.public.pollingIntervalMs);
  const timeoutMs = Number(runtimeConfig.public.pollingTimeoutMs);
  const isActive = computed(
    () =>
      analysis.value !== null &&
      ACTIVE_ANALYSIS_STATUSES.has(analysis.value.status)
  );

  async function loadLatest(background = false): Promise<void> {
    if (requestInFlight || stopped) {
      return;
    }
    requestInFlight = true;
    background ? (refreshing.value = true) : (loading.value = true);
    try {
      const response = await apiFetch<
        ApiResponse<{ analysis: AiFailureAnalysis | null }>
      >(`/api/test-runs/${toValue(runId)}/ai-analysis`);
      if (!response.success) {
        error.value = response.error.message;
        stopTimer();
        return;
      }
      analysis.value = response.data.analysis;
      error.value = null;
      scheduleNext();
    } catch (requestError: unknown) {
      error.value = extractApiErrorMessage(requestError);
      stopTimer();
    } finally {
      requestInFlight = false;
      loading.value = false;
      refreshing.value = false;
    }
  }

  async function loadById(analysisId: string): Promise<void> {
    try {
      const response = await apiFetch<ApiResponse<AiFailureAnalysis>>(
        `/api/ai-analyses/${analysisId}`
      );
      if (!response.success) {
        error.value = response.error.message;
        return;
      }
      analysis.value = response.data;
      error.value = null;
      scheduleNext();
    } catch (requestError: unknown) {
      error.value = extractApiErrorMessage(requestError);
    }
  }

  async function request(force = false): Promise<boolean> {
    if (requesting.value || isActive.value) {
      return false;
    }
    requesting.value = true;
    error.value = null;
    try {
      const response = await apiFetch<ApiResponse<AiFailureAnalysisAccepted>>(
        `/api/test-runs/${toValue(runId)}/ai-analysis`,
        { method: "POST", body: { force } }
      );
      if (!response.success) {
        error.value = response.error.message;
        return false;
      }
      stopped = false;
      timedOut.value = false;
      pollingStartedAt = Date.now();
      await loadById(response.data.analysisId);
      return true;
    } catch (requestError: unknown) {
      error.value = extractApiErrorMessage(requestError);
      return false;
    } finally {
      requesting.value = false;
    }
  }

  async function retry(): Promise<boolean> {
    if (analysis.value === null || requesting.value || isActive.value) {
      return false;
    }
    if (analysis.value.status === "completed") {
      return request(true);
    }
    requesting.value = true;
    error.value = null;
    try {
      const response = await apiFetch<ApiResponse<AiFailureAnalysisAccepted>>(
        `/api/ai-analyses/${analysis.value.id}/retry`,
        { method: "POST" }
      );
      if (!response.success) {
        error.value = response.error.message;
        return false;
      }
      stopped = false;
      timedOut.value = false;
      pollingStartedAt = Date.now();
      await loadById(response.data.analysisId);
      return true;
    } catch (requestError: unknown) {
      error.value = extractApiErrorMessage(requestError);
      return false;
    } finally {
      requesting.value = false;
    }
  }

  function scheduleNext(): void {
    stopTimer();
    if (stopped || !isActive.value) {
      return;
    }
    if (Date.now() - pollingStartedAt >= timeoutMs) {
      timedOut.value = true;
      error.value =
        "AI 분석 상태 확인 시간이 초과되었습니다. 새로고침하여 다시 확인해 주세요.";
      return;
    }
    timer = setTimeout(() => {
      void loadLatest(true);
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
    void loadLatest(false);
  }

  function stop(): void {
    stopped = true;
    stopTimer();
  }

  async function refresh(): Promise<void> {
    stopped = false;
    timedOut.value = false;
    pollingStartedAt = Date.now();
    await loadLatest(false);
  }

  onBeforeUnmount(stop);

  return {
    analysis,
    loading,
    refreshing,
    requesting,
    error,
    timedOut,
    isActive,
    start,
    stop,
    refresh,
    request,
    retry
  };
}

