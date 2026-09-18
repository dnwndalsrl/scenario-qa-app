<script setup lang="ts">
import type { SiteAnalysis } from "~/shared/types/analysis";
import type { UiAuditHistoryItem } from "~/shared/types/ui-audit";
import { filterAnalysisHistory, type AnalysisHistoryStatus } from "~/shared/utils/analysis-history";
import { filterUiAuditHistory } from "~/shared/utils/ui-audit-history";
import { formatKoreanDateTime } from "~/utils/date-format";
import { uiLabel } from "~/utils/ui-label";

type HistoryType = "all" | "functional" | "ui";
const { $api } = useNuxtApp();
const { data: analysisData, refresh: refreshAnalyses, error: analysisError } = await useFetch<{ items: SiteAnalysis[] }>("/api/analyses", { $fetch: $api, default: () => ({ items: [] }) });
const { data: uiAuditData, refresh: refreshUiAudits, error: uiAuditError } = await useFetch<{ items: UiAuditHistoryItem[] }>("/api/ui-audits", { $fetch: $api, default: () => ({ items: [] }) });
const query = ref(""); const typeFilter = ref<HistoryType>("all"); const statusFilter = ref<AnalysisHistoryStatus>("all");
const visibleAnalyses = computed(() => typeFilter.value === "ui" ? [] : filterAnalysisHistory(analysisData.value.items, query.value, statusFilter.value));
const visibleUiAudits = computed(() => typeFilter.value === "functional" ? [] : filterUiAuditHistory(uiAuditData.value.items, query.value, statusFilter.value));
const visibleCount = computed(() => visibleAnalyses.value.length + visibleUiAudits.value.length);
const totalCount = computed(() => analysisData.value.items.length + uiAuditData.value.items.length);
const hasError = computed(() => Boolean(analysisError.value || uiAuditError.value));
const tone = (item: { status: string }) => item.status === "completed" ? "success" : item.status === "failed" ? "failed" : "warning";
async function refresh() { await Promise.all([refreshAnalyses(), refreshUiAudits()]); }
</script>

<template>
  <div class="history-page">
    <header class="section-head"><div><div class="title-line"><h1>분석 이력</h1><span>{{ totalCount }}건</span></div><p>기능 QA와 UI 점검 실행 기록을 최신순으로 확인합니다.</p></div><div class="history-actions"><button class="secondary-button" type="button" @click="refresh">새로고침</button><NuxtLink class="primary-button" to="/">새 분석</NuxtLink></div></header>
    <section class="history-toolbar" aria-label="분석 이력 필터"><input v-model="query" type="search" placeholder="URL 검색"><select v-model="typeFilter" aria-label="분석 유형"><option value="all">전체 유형</option><option value="functional">기능 QA</option><option value="ui">UI 점검</option></select><select v-model="statusFilter" aria-label="상태"><option value="all">전체 상태</option><option value="completed">완료</option><option value="failed">실패</option><option value="active">진행 중</option></select><span>{{ visibleCount }}건 표시</span></section>
    <div v-if="hasError" class="error-box" role="alert">분석 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>
    <div v-else-if="!totalCount" class="empty"><strong>분석 기록이 없습니다</strong><p>새 분석을 시작하면 실행 기록이 여기에 표시됩니다.</p></div>
    <div v-else-if="!visibleCount" class="empty"><strong>조건에 맞는 기록이 없습니다</strong><p>검색어나 필터를 변경해 주세요.</p></div>
    <section v-else class="history-table" aria-label="분석 이력 목록">
      <div class="history-row history-row--head"><span>유형</span><span>대상 URL</span><span>상태</span><span>실행 시각</span><span>결과</span></div>
      <NuxtLink v-for="item in visibleAnalyses" :key="`analysis-${item.id}`" class="history-row" :to="`/analyses/${item.id}`"><span>기능 QA</span><strong>{{ item.normalizedUrl }}</strong><span class="tag" :class="`tag--${tone(item)}`">{{ uiLabel(item.status) }}</span><time>{{ formatKoreanDateTime(item.createdAt) }}</time><span>{{ item.currentMessage }}</span></NuxtLink>
      <NuxtLink v-for="item in visibleUiAudits" :key="`audit-${item.id}`" class="history-row" :to="`/ui-audits/${item.id}`"><span>UI 점검</span><strong>{{ item.normalizedUrl }}</strong><span class="tag" :class="`tag--${tone(item)}`">{{ uiLabel(item.status) }}</span><time>{{ formatKoreanDateTime(item.createdAt) }}</time><span>{{ item.summary ? `문제 ${item.summary.issueCount}건` : item.currentMessage }}</span></NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.title-line{display:flex;align-items:baseline;gap:10px}.title-line span{color:var(--text-3);font-size:var(--fs-body)}.history-actions{display:flex;gap:8px}.history-actions a{display:inline-flex;align-items:center}.history-toolbar{display:grid;grid-template-columns:minmax(360px,1fr) 160px 160px auto;align-items:center;gap:8px;margin-bottom:var(--section-gap);padding:16px;border-radius:var(--r-card);background:var(--surface)}.history-toolbar input,.history-toolbar select{height:var(--h-input);padding:0 12px;border:1px solid var(--border);border-radius:var(--r-pill)}.history-toolbar>span{justify-self:end;color:var(--text-3);font-size:var(--fs-meta)}.history-table{overflow:hidden;padding:0 12px;border-radius:var(--r-card);background:var(--surface)}.history-row{display:grid;grid-template-columns:88px minmax(0,1fr) 112px 184px 240px;align-items:center;gap:16px;min-height:48px;padding:0 16px;border-top:1px solid var(--border);background:var(--bg);font-size:var(--fs-small)}.history-row--head{min-height:42px;border:0;background:transparent;color:var(--text-3);font-size:var(--fs-meta);font-weight:var(--fw-medium)}a.history-row:hover{background:var(--surface-2)}.history-row strong,.history-row>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-row strong,.history-row time{font-family:var(--font-mono);font-weight:var(--fw-regular)}.history-row time{color:var(--text-3);font-size:var(--fs-meta)}.empty strong{display:block;font-size:15px;font-weight:var(--fw-medium)}.empty p{margin:6px 0 0}
</style>
