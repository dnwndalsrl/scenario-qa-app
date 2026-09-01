<script setup lang="ts">
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { AnalysisDetail, SiteAnalysisStatus } from "~/shared/types/analysis";
import type { AnalysisPreflight, PreflightStatus } from "~/shared/types/preflight";

const route = useRoute();
const { $api } = useNuxtApp();
const analysisId = computed(() => String(route.params.analysisId));
const endpoint = computed(() => `/api/analyses/${analysisId.value}`);
const terminal = ["completed", "partially_completed", "failed"];
const staleAfterMs = 15 * 60 * 1000;
const staleGraceMs = 5000;
const busy = ref(false);
const pdfDownloading = ref(false);
const preflight = ref<AnalysisPreflight>();
const preflightLoading = ref(false);
const preflightError = ref("");
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
    error: row.error && typeof row.error === "object" ? row.error as AnalysisDetail["analysis"]["error"] : undefined,
    processStage: typeof row.process_stage === "string" ? row.process_stage as AnalysisDetail["analysis"]["processStage"] : current.processStage,
    scenariosApprovedAt: typeof row.scenarios_approved_at === "string" ? row.scenarios_approved_at : current.scenariosApprovedAt
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
        if (row.id === targetId) applyRealtimeUpdate(row);
      }
    )
    .subscribe((status) => {
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

onMounted(() => {
  if (data.value?.analysis.processStage === "scenario_review") void checkPreflight();
});

watch(
  [analysisId, () => data.value?.analysis.id, () => data.value?.analysis.status],
  () => {
    if (!data.value || data.value.analysis.id !== analysisId.value) return;
    if (isTerminal(data.value.analysis.status)) stopRealtime();
    else void startRealtime();
  }
);

watch(() => data.value?.analysis.processStage, (stage) => {
  if (stage === "scenario_review") void checkPreflight();
  else { preflight.value = undefined; preflightError.value = ""; }
});

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

function preflightLabel(status: PreflightStatus) {
  return status === "ready" ? "실행 가능" : status === "warning" ? "주의 필요" : "실행 불가";
}

async function checkPreflight() {
  preflightLoading.value = true;
  preflightError.value = "";
  try {
    const result = await $api<AnalysisPreflight>(`${endpoint.value}/preflight`);
    preflight.value = result;
    return result;
  } catch (cause: any) {
    preflight.value = undefined;
    preflightError.value = cause?.data?.statusMessage || cause?.message || "실행 전 점검에 실패했습니다.";
  } finally {
    preflightLoading.value = false;
  }
}

async function runApproved() {
  busy.value = true; actionError.value = "";
  try {
    const checked = await checkPreflight();
    if (!checked?.canRun) { actionError.value = checked ? "실행 불가 항목을 해결한 뒤 다시 점검해 주세요." : "실행 전 점검을 완료하지 못했습니다."; return; }
    await $api(`${endpoint.value}/run`, { method: "POST" }); await refreshDetail();
  }
  catch (cause: any) { actionError.value = cause?.data?.statusMessage || cause?.message || "테스트 실행 요청에 실패했습니다."; }
  finally { busy.value = false; }
}

async function continueWithoutDocument() {
  busy.value = true; actionError.value = "";
  try { await $api(`${endpoint.value}/documents/continue`, { method: "POST" }); await refreshDetail(); }
  catch (cause: any) { actionError.value = cause?.data?.statusMessage || cause?.message || "문서 없이 계속하지 못했습니다."; }
  finally { busy.value = false; }
}

async function downloadPdfReport() {
  pdfDownloading.value = true;
  actionError.value = "";
  try {
    const blob = await $api<Blob>(`${endpoint.value}/report/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `probe-qa-final-report-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (cause: any) {
    actionError.value = cause?.data?.statusMessage || cause?.data?.message || cause?.message || "PDF 보고서 다운로드에 실패했습니다.";
  } finally {
    pdfDownloading.value = false;
  }
}
</script>

<template>
  <div v-if="data">
    <header class="report-head">
      <div>
        <p class="eyebrow">{{ data.analysis.options.mode === 'site_crawl' ? '사이트 QA 보고서' : '단일 페이지 QA 보고서' }}</p>
        <h1 class="report-title">분석 보고서</h1>
        <p class="report-url">{{ data.analysis.normalizedUrl }}</p>
        <span v-if="data.analysis.authenticationEnabled" class="status-pill">로그인 상태로 분석</span>
      </div>
      <div class="report-head__actions">
        <button v-if="data.analysis.processStage === 'report_complete'" type="button" class="report-download-button" :disabled="pdfDownloading" @click="downloadPdfReport">{{ pdfDownloading ? 'PDF 생성 중…' : 'PDF 다운로드' }}</button>
        <button v-if="data.analysis.processStage === 'scenario_review'" class="primary-button" :disabled="busy || preflightLoading || !preflight?.canRun" @click="runApproved">{{ preflightLoading ? '실행 조건 확인 중…' : '시나리오 확정 및 테스트 실행' }}</button>
        <button v-else-if="data.analysis.processStage === 'document_failed'" class="primary-button" :disabled="busy" @click="continueWithoutDocument">문서 없이 계속</button>
        <button v-else-if="data.analysis.processStage === 'report_complete' || data.analysis.processStage === 'failed'" class="primary-button" :disabled="busy" @click="retry">다시 분석</button>
        <button v-else class="primary-button" :disabled="busy" @click="cancel">취소 요청</button>
      </div>
    </header>
    <div v-if="data.analysis.processStage === 'report_complete'" class="report-outline" role="navigation" aria-label="보고서 바로가기"><strong>보고서 바로가기</strong><a href="#report-summary">결과 요약</a><a v-if="data.documentAnalysis?.requirements.length" href="#report-coverage">요구사항 커버리지</a><a href="#report-comparison">이전 비교</a><a href="#report-page">페이지 분석</a><a v-if="data.analysis.options.mode !== 'site_crawl'" href="#report-scenarios">테스트 시나리오</a><a href="#report-results">실행 결과</a><a href="#report-defects">결함 관리</a><a v-if="data.analysis.options.mode !== 'site_crawl'" href="#report-issues">발견 문제</a></div>
    <div v-if="actionError" class="error-box">{{ actionError }}</div>
    <div v-if="realtimeWarning" class="notice realtime-notice">
      <span>{{ realtimeWarning }}</span>
      <button type="button" :disabled="busy" @click="refreshDetail">상태 새로고침</button>
    </div>
    <AnalysisProgress :analysis="data.analysis" />
    <AnalysisSummary id="report-summary" v-if="data.analysis.summary && data.analysis.processStage === 'report_complete'" :summary="data.analysis.summary" />
    <RegressionComparison id="report-comparison" v-if="data.analysis.processStage === 'report_complete'" :analysis-id="data.analysis.id" />
    <AnalysisProcessSteps id="report-process" :stage="data.analysis.processStage" :has-document="Boolean(data.documentAnalysis)" />
    <section v-if="data.analysis.processStage === 'scenario_review'" class="card preflight-panel" aria-labelledby="preflight-title">
      <header class="preflight-panel__head">
        <div><p class="eyebrow">3단계 실행 준비</p><h2 id="preflight-title">실행 전 사전 점검</h2><p>환경 오류와 실제 테스트 실패를 구분하기 위해 실행 조건을 먼저 확인합니다.</p></div>
        <div class="preflight-panel__actions"><span v-if="preflight" class="preflight-summary" :class="`preflight-summary--${preflight.status}`">{{ preflightLabel(preflight.status) }}</span><button type="button" :disabled="preflightLoading || busy" @click="checkPreflight">{{ preflightLoading ? '확인 중…' : '다시 점검' }}</button></div>
      </header>
      <div v-if="preflight" class="preflight-checks">
        <article v-for="check in preflight.checks" :key="check.id" class="preflight-check" :class="`preflight-check--${check.status}`"><span class="preflight-check__mark" aria-hidden="true">{{ check.status === 'ready' ? '✓' : check.status === 'warning' ? '!' : '×' }}</span><div><strong>{{ check.label }}</strong><p>{{ check.message }}</p></div><span>{{ preflightLabel(check.status) }}</span></article>
      </div>
      <div v-else-if="preflightError" class="preflight-panel__error" role="alert">{{ preflightError }}</div>
      <div v-else class="preflight-panel__loading">실행 조건을 확인하고 있습니다.</div>
      <footer v-if="preflight"><strong>자동 실행 대상 {{ preflight.readyScenarioCount }}개</strong><span v-if="preflight.excludedScenarioCount"> · 수동 검토 또는 제외 {{ preflight.excludedScenarioCount }}개</span><small>대상 페이지 접근 경고는 실행기 위치에서 결과가 달라질 수 있어 자동으로 차단하지 않습니다.</small></footer>
    </section>
    <RequirementDocumentPanel id="report-document" :document="data.documentAnalysis" />
    <RequirementCoverage id="report-coverage" :analysis-id="data.analysis.id" :document="data.documentAnalysis" :tests="data.generatedTests" :runs="data.testRuns" :can-run="data.analysis.processStage === 'report_complete'" @changed="refreshDetail" />
    <SiteAnalysisReport id="report-page" v-if="data.analysis.options.mode === 'site_crawl' && data.pages.length" :detail="data" @changed="refreshDetail" />
    <TestRunResult id="report-results" v-if="data.analysis.options.mode === 'site_crawl' && data.analysis.processStage === 'report_complete'" :analysis-id="data.analysis.id" :runs="data.testRuns" :tests="data.generatedTests" @changed="refreshDetail" />
    <DefectManager id="report-defects" v-if="data.analysis.options.mode === 'site_crawl' && data.analysis.processStage === 'report_complete'" :analysis-id="data.analysis.id" :runs="data.testRuns" :tests="data.generatedTests" @changed="refreshDetail" />
    <template v-else-if="data.snapshot && data.pageAnalysis">
      <PageOverview id="report-page" :snapshot="data.snapshot" :page-analysis="data.pageAnalysis" />
      <DiscoveredFunctions id="report-functions" :snapshot="data.snapshot" :page-analysis="data.pageAnalysis" />
      <GeneratedTestList id="report-scenarios" :analysis-id="data.analysis.id" :tests="data.generatedTests" :snapshot="data.snapshot" :runs="data.testRuns" :review-mode="data.analysis.processStage === 'scenario_review'" :can-run-suites="data.analysis.processStage === 'report_complete'" @changed="refreshDetail" />
      <TestRunResult id="report-results" v-if="data.analysis.processStage === 'report_complete'" :analysis-id="data.analysis.id" :runs="data.testRuns" :tests="data.generatedTests" @changed="refreshDetail" />
      <DefectManager id="report-defects" v-if="data.analysis.processStage === 'report_complete'" :analysis-id="data.analysis.id" :runs="data.testRuns" :tests="data.generatedTests" @changed="refreshDetail" />
      <IssueList id="report-issues" :snapshot="data.snapshot" :page-analysis="data.pageAnalysis" />
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
.report-head__actions{display:flex;align-items:center;gap:9px}.report-download-button{min-height:48px;padding:0 18px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:var(--ink);font-weight:800;cursor:pointer}.report-download-button::before{content:"↓";margin-right:7px}.report-download-button:disabled{cursor:wait;opacity:.65}.report-title{font-size:clamp(34px,5vw,42px)}.report-outline{position:sticky;top:82px;z-index:8;display:flex;max-width:100%;align-items:center;gap:6px;margin:0 0 18px;padding:9px 10px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.94);box-shadow:0 8px 24px rgba(32,49,79,.08);backdrop-filter:blur(10px)}.report-outline strong{flex:none;padding:0 8px;font-size:11px}.report-outline a{flex:none;padding:7px 9px;border-radius:8px;color:#526174;font-size:11px;font-weight:750}.report-outline a:hover{background:#f1f4f8;color:var(--ink)}@media(max-width:680px){.report-outline{top:76px;overflow-x:auto;overscroll-behavior-x:contain;white-space:nowrap;scrollbar-width:none}.report-outline::-webkit-scrollbar{display:none}.report-outline strong{display:none}.report-head{align-items:flex-start;flex-direction:column}.report-head>div,.report-head>div:last-child,.report-head .primary-button,.report-download-button{width:100%}.report-head__actions{align-items:stretch;flex-direction:column}}
.preflight-panel{margin-bottom:24px;padding:0;overflow:hidden}.preflight-panel__head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:24px 26px;border-bottom:1px solid var(--line)}.preflight-panel__head h2{margin:3px 0 6px;font-size:24px}.preflight-panel__head p{margin:0;color:var(--muted)}.preflight-panel__actions{display:flex;align-items:center;gap:9px}.preflight-panel__actions button{min-height:38px;padding:0 13px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);font-weight:750;cursor:pointer}.preflight-panel__actions button:disabled{cursor:wait;opacity:.6}.preflight-summary{display:inline-flex;align-items:center;min-height:30px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:800}.preflight-summary--ready{background:#e7f6ef;color:#147353}.preflight-summary--warning{background:#fff4d8;color:#8a5b00}.preflight-summary--blocked{background:#fdebea;color:#b42318}.preflight-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:18px 26px}.preflight-check{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:11px;padding:14px;border:1px solid var(--line);border-radius:12px;background:#fafbfd}.preflight-check__mark{display:grid;width:28px;height:28px;place-items:center;border-radius:50%;background:#eef2f6;font-weight:900}.preflight-check strong{display:block;font-size:13px}.preflight-check p{margin:3px 0 0;color:var(--muted);font-size:12px;line-height:1.45}.preflight-check>span:last-child{font-size:11px;font-weight:800}.preflight-check--ready .preflight-check__mark,.preflight-check--ready>span:last-child{color:#147353}.preflight-check--warning .preflight-check__mark,.preflight-check--warning>span:last-child{color:#8a5b00}.preflight-check--blocked .preflight-check__mark,.preflight-check--blocked>span:last-child{color:#b42318}.preflight-panel__loading,.preflight-panel__error{margin:18px 26px;padding:18px;border-radius:12px;background:#f5f7fa;color:var(--muted)}.preflight-panel__error{background:#fdebea;color:#b42318}.preflight-panel footer{display:flex;align-items:center;gap:4px;padding:14px 26px;border-top:1px solid var(--line);background:#fafbfd;font-size:12px}.preflight-panel footer small{margin-left:auto;color:var(--muted)}@media(max-width:760px){.preflight-panel__head{flex-direction:column}.preflight-panel__actions{width:100%;justify-content:space-between}.preflight-checks{grid-template-columns:1fr}.preflight-panel footer{align-items:flex-start;flex-wrap:wrap}.preflight-panel footer small{width:100%;margin:6px 0 0}}@media(max-width:480px){.preflight-panel__head,.preflight-checks{padding-left:18px;padding-right:18px}.preflight-check{grid-template-columns:30px minmax(0,1fr)}.preflight-check>span:last-child{grid-column:2}.preflight-panel footer{padding-left:18px;padding-right:18px}}
</style>
