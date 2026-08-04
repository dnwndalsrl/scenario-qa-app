<script setup lang="ts">
import type { AnalysisDetail } from "~/shared/types/analysis";

const route = useRoute();
const { $api } = useNuxtApp();
const endpoint = computed(() => `/api/analyses/${route.params.analysisId}`);
const terminal = ["completed", "partially_completed", "failed"];
const pollIntervalMs = 5000;
const maxIdleMs = 16 * 60 * 1000;
const maxConsecutiveErrors = 3;
const busy = ref(false);
const actionError = ref("");
const pollingStopped = ref(false);
const { data, refresh, error } = await useFetch<AnalysisDetail>(endpoint, { $fetch: $api });
let timer: ReturnType<typeof setTimeout> | undefined;
let refreshing = false;
let consecutiveErrors = 0;

function stopPolling(message = "") {
  if (timer) clearTimeout(timer);
  timer = undefined;
  pollingStopped.value = true;
  if (message) actionError.value = message;
}

function schedulePoll() {
  if (timer || pollingStopped.value || !data.value || terminal.includes(data.value.analysis.status)) return;
  timer = setTimeout(poll, pollIntervalMs);
}

async function poll() {
  timer = undefined;
  if (!data.value || terminal.includes(data.value.analysis.status)) return;
  const updatedAt = Date.parse(data.value.analysis.updatedAt);
  if (Number.isFinite(updatedAt) && Date.now() - updatedAt > maxIdleMs) {
    stopPolling("16분 이상 상태 변경이 없어 자동 조회를 중단했습니다. 취소하거나 다시 분석해 주세요.");
    return;
  }
  if (document.visibilityState !== "visible" || refreshing) {
    schedulePoll();
    return;
  }
  refreshing = true;
  try {
    await refresh();
    consecutiveErrors = error.value ? consecutiveErrors + 1 : 0;
  } finally {
    refreshing = false;
  }
  if (consecutiveErrors >= maxConsecutiveErrors) {
    stopPolling("연속된 조회 오류로 자동 조회를 중단했습니다. 잠시 후 페이지를 새로고침해 주세요.");
    return;
  }
  schedulePoll();
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") schedulePoll();
}

onMounted(() => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  schedulePoll();
});
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
async function retry(){busy.value=true;actionError.value="";try{const result=await $api<{analysisId:string}>(`${endpoint.value}/retry`,{method:"POST"});await navigateTo(`/analyses/${result.analysisId}`)}catch(cause:any){actionError.value=cause?.data?.statusMessage||cause?.message||"재실행 요청에 실패했습니다."}finally{busy.value=false}}
async function cancel(){busy.value=true;try{await $api(`${endpoint.value}/cancel`,{method:"POST"});await refresh()}catch(cause:any){actionError.value=cause?.data?.statusMessage||cause?.message||"취소 요청에 실패했습니다."}finally{busy.value=false}}
</script>
<template><div v-if="data"><header class="report-head"><div><p class="eyebrow">AI QA report · {{data.analysis.options.mode==='site_crawl'?'site crawl':'single page'}}</p><h1 style="font-size:42px">분석 보고서</h1><p class="report-url">{{data.analysis.normalizedUrl}}</p></div><div><button v-if="terminal.includes(data.analysis.status)" class="primary-button" :disabled="busy" @click="retry">다시 분석</button><button v-else class="primary-button" :disabled="busy" @click="cancel">취소 요청</button></div></header><div v-if="actionError" class="error-box">{{actionError}}</div><AnalysisProgress :analysis="data.analysis"/><AnalysisSummary v-if="data.analysis.summary" :summary="data.analysis.summary"/><SiteAnalysisReport v-if="data.analysis.options.mode==='site_crawl'&&data.pages.length" :detail="data"/><template v-else-if="data.snapshot&&data.pageAnalysis"><PageOverview :snapshot="data.snapshot" :page-analysis="data.pageAnalysis"/><DiscoveredFunctions :snapshot="data.snapshot" :page-analysis="data.pageAnalysis"/><GeneratedTestList :tests="data.generatedTests" :snapshot="data.snapshot"/><TestRunResult :runs="data.testRuns" :tests="data.generatedTests"/><IssueList :snapshot="data.snapshot" :page-analysis="data.pageAnalysis"/></template><div v-else-if="terminal.includes(data.analysis.status)&&data.analysis.error" class="error-box">{{data.analysis.error.message}}</div><div v-else class="empty">실행기가 결과를 저장하는 중입니다.</div></div><div v-else-if="error" class="error-box">분석 보고서를 불러오지 못했습니다.</div><div v-else class="empty">분석 보고서를 불러오는 중입니다.</div></template>
