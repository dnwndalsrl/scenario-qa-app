<script setup lang="ts">
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { AnalysisDetail, SiteAnalysisStatus } from "~/shared/types/analysis";

const route = useRoute();
const { $api } = useNuxtApp();
const analysisId = computed(() => String(route.params.analysisId));
const endpoint = computed(() => `/api/analyses/${analysisId.value}`);
const terminal = ["completed", "partially_completed", "failed"];
const staleAfterMs = 15 * 60 * 1000;
const staleGraceMs = 5000;
const busy = ref(false);
const actionError = ref("");
const realtimeWarning = ref("");
const { data, refresh, error } = await useFetch<AnalysisDetail>(endpoint, { $fetch: $api });

let channel: RealtimeChannel | undefined;
let staleTimer: ReturnType<typeof setTimeout> | undefined;
let refreshPromise: Promise<void> | undefined;
let subscribedAnalysisId = "";

function isTerminal(status: string) {
  return terminal.includes(status);
}

function toClientStatus(status: unknown): SiteAnalysisStatus {
  if (["queued", "dispatching", "dispatched"].includes(String(status))) return "pending";
  if (["running", "cancel_requested"].includes(String(status))) return "launching_browser";
  if (["cancelled", "dispatch_failed"].includes(String(status))) return "failed";
  return String(status) as SiteAnalysisStatus;
}

function clearStaleTimer() {
  if (staleTimer) clearTimeout(staleTimer);
  staleTimer = undefined;
}

function scheduleStaleCheck(updatedAt?: string) {
  clearStaleTimer();
  if (!data.value || isTerminal(data.value.analysis.status) || !updatedAt) return;
  const updatedTime = Date.parse(updatedAt);
  if (!Number.isFinite(updatedTime)) return;
  const delay = Math.max(0, updatedTime + staleAfterMs + staleGraceMs - Date.now());
  staleTimer = setTimeout(() => void refreshDetail(), delay);
}

async function refreshDetail() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    await refresh();
    if (error.value) realtimeWarning.value = "최신 분석 상태를 불러오지 못했습니다. 잠시 후 직접 새로고침해 주세요.";
    else if (data.value) scheduleStaleCheck(data.value.analysis.updatedAt);
  })().finally(() => {
    refreshPromise = undefined;
  });
  return refreshPromise;
}

function applyRealtimeUpdate(row: Record<string, unknown>) {
  if (!data.value) return;
  const status = toClientStatus(row.status);
  const current = data.value.analysis;
  const updated = {
    ...current,
    status,
    progress: typeof row.progress === "number" ? row.progress : current.progress,
    currentMessage: typeof row.current_message === "string" ? row.current_message : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : current.updatedAt,
    startedAt: typeof row.started_at === "string" ? row.started_at : current.startedAt,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : undefined,
    error: row.error && typeof row.error === "object" ? row.error as AnalysisDetail["analysis"]["error"] : undefined
  };
  // Nuxt 4의 useFetch 데이터는 얕은 ref일 수 있으므로 객체를 교체해야 화면이 다시 렌더링된다.
  data.value = { ...data.value, analysis: updated };
  scheduleStaleCheck(updated.updatedAt);

  // 진행 중에는 Realtime 행 데이터만 반영하고, 보고서가 완성된 시점에 상세 데이터를 한 번만 조회한다.
  if (isTerminal(status)) {
    stopRealtime();
    void refreshDetail();
  }
}

function stopRealtime() {
  clearStaleTimer();
  if (channel) void useSupabaseBrowser().removeChannel(channel);
  channel = undefined;
  subscribedAnalysisId = "";
}

async function startRealtime() {
  const targetId = analysisId.value;
  if (!data.value || data.value.analysis.id !== targetId || isTerminal(data.value.analysis.status)) return;
  if (channel && subscribedAnalysisId === targetId) return;

  stopRealtime();
  subscribedAnalysisId = targetId;
  scheduleStaleCheck(data.value.analysis.updatedAt);
  const supabase = useSupabaseBrowser();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (analysisId.value !== targetId) {
    subscribedAnalysisId = "";
    void startRealtime();
    return;
  }
  if (sessionError || !sessionData.session) {
    subscribedAnalysisId = "";
    realtimeWarning.value = "실시간 상태 연결을 인증하지 못했습니다. 상태 새로고침을 이용해 주세요.";
    return;
  }
  await supabase.realtime.setAuth(sessionData.session.access_token);
  channel = supabase
    .channel(`analysis:${targetId}`, {
      config: { private: true, broadcast: { replication_ready: true } }
    })
    .on(
      "broadcast",
      { event: "*" },
      (message) => {
        const row = (message.payload ?? message) as Record<string, unknown>;
        console.info("[analysis-realtime] broadcast", { id: row.id, progress: row.progress });
        if (row.id === targetId) applyRealtimeUpdate(row);
      }
    )
    .subscribe((status) => {
      console.info("[analysis-realtime] status", status);
      if (status === "SUBSCRIBED") {
        realtimeWarning.value = "";
        // SSR 조회와 구독 시작 사이에 발생한 변경을 한 번만 동기화한다.
        void refreshDetail();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        realtimeWarning.value = "실시간 상태 연결이 지연되고 있습니다. 필요하면 상태를 직접 새로고침해 주세요.";
      }
    });
}

onMounted(() => void startRealtime());

watch(
  [analysisId, () => data.value?.analysis.id, () => data.value?.analysis.status],
  () => {
    if (!data.value || data.value.analysis.id !== analysisId.value) return;
    if (isTerminal(data.value.analysis.status)) stopRealtime();
    else void startRealtime();
  }
);

onBeforeUnmount(stopRealtime);

async function retry() {
  busy.value = true;
  actionError.value = "";
  try {
    const result = await $api<{ analysisId: string }>(`${endpoint.value}/retry`, { method: "POST" });
    await navigateTo(`/analyses/${result.analysisId}`);
  } catch (cause: any) {
    actionError.value = cause?.data?.statusMessage || cause?.message || "재실행 요청에 실패했습니다.";
  } finally {
    busy.value = false;
  }
}

async function cancel() {
  busy.value = true;
  actionError.value = "";
  try {
    await $api(`${endpoint.value}/cancel`, { method: "POST" });
    await refreshDetail();
  } catch (cause: any) {
    actionError.value = cause?.data?.statusMessage || cause?.message || "취소 요청에 실패했습니다.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="data">
    <header class="report-head">
      <div>
        <p class="eyebrow">AI QA report · {{ data.analysis.options.mode === 'site_crawl' ? 'site crawl' : 'single page' }}</p>
        <h1 style="font-size:42px">분석 보고서</h1>
        <p class="report-url">{{ data.analysis.normalizedUrl }}</p>
      </div>
      <div>
        <button v-if="terminal.includes(data.analysis.status)" class="primary-button" :disabled="busy" @click="retry">다시 분석</button>
        <button v-else class="primary-button" :disabled="busy" @click="cancel">취소 요청</button>
      </div>
    </header>
    <div v-if="actionError" class="error-box">{{ actionError }}</div>
    <div v-if="realtimeWarning" class="notice realtime-notice">
      <span>{{ realtimeWarning }}</span>
      <button type="button" :disabled="busy" @click="refreshDetail">상태 새로고침</button>
    </div>
    <AnalysisProgress :analysis="data.analysis" />
    <AnalysisSummary v-if="data.analysis.summary" :summary="data.analysis.summary" />
    <SiteAnalysisReport v-if="data.analysis.options.mode === 'site_crawl' && data.pages.length" :detail="data" />
    <template v-else-if="data.snapshot && data.pageAnalysis">
      <PageOverview :snapshot="data.snapshot" :page-analysis="data.pageAnalysis" />
      <DiscoveredFunctions :snapshot="data.snapshot" :page-analysis="data.pageAnalysis" />
      <GeneratedTestList :tests="data.generatedTests" :snapshot="data.snapshot" />
      <TestRunResult :runs="data.testRuns" :tests="data.generatedTests" />
      <IssueList :snapshot="data.snapshot" :page-analysis="data.pageAnalysis" />
    </template>
    <div v-else-if="terminal.includes(data.analysis.status) && data.analysis.error" class="error-box">{{ data.analysis.error.message }}</div>
    <div v-else class="empty">실행기가 결과를 저장하는 중입니다.</div>
  </div>
  <div v-else-if="error" class="error-box">분석 보고서를 불러오지 못했습니다.</div>
  <div v-else class="empty">분석 보고서를 불러오는 중입니다.</div>
</template>

<style scoped>
.realtime-notice { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.realtime-notice button { flex:none; min-height:36px; padding:0 14px; border:1px solid var(--line); border-radius:10px; background:#fff; cursor:pointer; }
</style>
