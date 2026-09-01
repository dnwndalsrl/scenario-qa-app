<script setup lang="ts">
import type { SiteAnalysis } from "~/shared/types/analysis";
import { filterAnalysisHistory, groupAnalysisHistory, type AnalysisHistoryStatus } from "~/shared/utils/analysis-history";
import { formatKoreanDateTime } from "~/utils/date-format";
import { uiLabel } from "~/utils/ui-label";

const { $api } = useNuxtApp();
const { data, refresh, error } = await useFetch<{ items: SiteAnalysis[] }>("/api/analyses", { $fetch: $api, default: () => ({ items: [] }) });
const query = ref("");
const statusFilter = ref<AnalysisHistoryStatus>("all");
const visibleItems = computed(() => filterAnalysisHistory(data.value.items, query.value, statusFilter.value));
const groups = computed(() => groupAnalysisHistory(visibleItems.value));
const isActive = (item: SiteAnalysis) => !["completed", "partially_completed", "failed"].includes(item.status);
const tone = (item: SiteAnalysis) => item.status === "completed" ? "success" : item.status === "failed" ? "failed" : "warning";
const comparable = (item: SiteAnalysis) => ["completed", "partially_completed"].includes(item.status);
function comparisonTarget(analyses: SiteAnalysis[]) {
  const completed = analyses.filter(comparable);
  return completed.length > 1 ? completed[0] : undefined;
}
</script>

<template>
  <div class="history-page">
    <div class="section-head history-head"><div><p class="eyebrow">분석 기록</p><h1>분석 이력</h1><p>같은 URL의 실행 기록을 묶어 최신 결과부터 보여줍니다.</p></div><button class="primary-button" @click="() => refresh()">새로고침</button></div>
    <section class="card history-filter" aria-label="분석 이력 필터"><label><span>URL 검색</span><input v-model="query" type="search" placeholder="분석한 URL 검색"></label><label><span>상태</span><select v-model="statusFilter"><option value="all">전체 상태</option><option value="completed">완료</option><option value="failed">실패</option><option value="active">진행 중</option></select></label><span class="history-filter__count">{{ visibleItems.length }}건</span></section>
    <div v-if="error" class="error-box" role="alert">분석 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>
    <div v-else-if="!data.items.length" class="empty">분석 기록이 없습니다.</div>
    <div v-else-if="!groups.length" class="empty">조건에 맞는 분석 기록이 없습니다.</div>
    <div v-else class="history-groups">
      <article v-for="group in groups" :key="group.url" class="card history-group">
        <header><div><strong>{{ group.url }}</strong><span>총 {{ group.analyses.length }}회 분석</span><NuxtLink v-if="comparisonTarget(group.analyses)" class="history-compare" :to="`/analyses/${comparisonTarget(group.analyses)!.id}#report-comparison`">이전 결과와 비교</NuxtLink></div></header>
        <NuxtLink class="history-run history-run--latest" :to="`/analyses/${group.analyses[0]!.id}`"><div class="history-run__content"><b>최신 분석</b><span class="history-run__time">{{ formatKoreanDateTime(group.analyses[0]!.createdAt) }}</span><span class="history-run__message">{{ group.analyses[0]!.currentMessage }}</span><span v-if="isActive(group.analyses[0]!)" class="history-run__progress">{{ group.analyses[0]!.progress }}%</span></div><span class="tag history-run__status" :class="`tag--${tone(group.analyses[0]!)}`">{{ uiLabel(group.analyses[0]!.status) }}</span></NuxtLink>
        <details v-if="group.analyses.length > 1" class="history-previous"><summary>이전 분석 {{ group.analyses.length - 1 }}건 보기</summary><NuxtLink v-for="item in group.analyses.slice(1)" :key="item.id" class="history-run" :to="`/analyses/${item.id}`"><div class="history-run__content"><span class="history-run__time">{{ formatKoreanDateTime(item.createdAt) }}</span><span class="history-run__message">{{ item.currentMessage }}</span><span v-if="isActive(item)" class="history-run__progress">{{ item.progress }}%</span></div><span class="tag history-run__status" :class="`tag--${tone(item)}`">{{ uiLabel(item.status) }}</span></NuxtLink></details>
      </article>
    </div>
  </div>
</template>

<style scoped>
.history-head{align-items:flex-end}.history-head h1{font-size:42px}.history-filter{display:grid;grid-template-columns:minmax(240px,1fr) 180px auto;align-items:end;gap:12px;margin:24px 0 18px;padding:16px 18px;border-radius:16px;box-shadow:none}.history-filter label{display:grid;min-width:0;gap:6px;color:var(--muted);font-size:11px;font-weight:750}.history-filter input,.history-filter select{width:100%;min-width:0;min-height:40px;padding:0 11px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink)}.history-filter__count{padding:11px 2px;color:var(--muted);font-size:12px;font-weight:750}.history-groups{display:grid;gap:12px}.history-group{min-width:0;overflow:hidden;border-radius:18px;box-shadow:none}.history-group>header{padding:16px 18px;border-bottom:1px solid var(--line);background:#f8fafc}.history-group>header div{display:flex;min-width:0;align-items:baseline;gap:12px}.history-group>header strong{min-width:0;flex:1;overflow-wrap:anywhere}.history-group>header span{flex:none;color:var(--muted);font-size:11px}.history-compare{flex:none;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;color:#334155;font-size:10px;font-weight:800}.history-run{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;border-top:1px solid #edf1f5}.history-run--latest{border-top:0;background:#fff}.history-run:hover{background:#f8fafc}.history-run__content{display:flex;min-width:0;flex:1;align-items:center;gap:12px}.history-run b{flex:none;font-size:11px}.history-run__time,.history-run__message,.history-run__progress{overflow:hidden;color:var(--muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.history-run__message{flex:1}.history-run__progress,.history-run__status{flex:none}.history-previous{border-top:1px solid #edf1f5}.history-previous summary{padding:12px 18px;color:#475569;font-size:12px;font-weight:750;cursor:pointer}.history-previous[open] summary{border-bottom:1px solid #edf1f5}@media(max-width:680px){.history-head{align-items:flex-start;flex-direction:column}.history-head .primary-button{width:100%}.history-filter{grid-template-columns:1fr}.history-run{align-items:flex-start}.history-run__content{display:grid;gap:4px}.history-run__message{overflow:visible;white-space:normal;overflow-wrap:anywhere}.history-group>header div{align-items:flex-start;flex-direction:column;gap:5px}.history-compare{margin-top:4px}}@media(max-width:420px){.history-run{flex-direction:column}.history-run__status{align-self:flex-start}}
</style>
