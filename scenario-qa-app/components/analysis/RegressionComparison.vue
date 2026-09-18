<script setup lang="ts">
import type { RegressionChangeStatus, RegressionComparison, RegressionTestChange } from "~/shared/types/analysis";
import { formatKoreanDateTime } from "~/utils/date-format";
import { uiLabel } from "~/utils/ui-label";

const props = defineProps<{ analysisId: string }>();
const { $api } = useNuxtApp();
const comparison = ref<RegressionComparison | null>();
const loading = ref(true);
const error = ref("");
const filter = ref<"all" | "changed" | "issues">("all");

const changedStatuses = new Set<RegressionChangeStatus>(["new_failure", "resolved", "added", "removed", "unverified"]);
const issueStatuses = new Set<RegressionChangeStatus>(["new_failure", "persistent_failure", "unverified"]);
const visibleChanges = computed(() => {
  const items = comparison.value?.changes || [];
  if (filter.value === "changed") return items.filter((item) => changedStatuses.has(item.status));
  if (filter.value === "issues") return items.filter((item) => issueStatuses.has(item.status));
  return items;
});

const statusMeta: Record<RegressionChangeStatus, { label: string; tone: string }> = {
  new_failure: { label: "신규 실패", tone: "danger" }, persistent_failure: { label: "계속 실패", tone: "danger" },
  resolved: { label: "해결됨", tone: "success" }, stable_success: { label: "계속 정상", tone: "neutral" },
  added: { label: "새 시나리오", tone: "info" }, removed: { label: "제거된 시나리오", tone: "neutral" },
  unverified: { label: "검증 필요", tone: "warning" }
};
function runLabel(status?: RegressionTestChange["currentRunStatus"]) { return status ? uiLabel(status) : "미실행"; }
function deltaLabel(value: number) { return `${value > 0 ? "+" : ""}${value}%p`; }

onMounted(async () => {
  try {
    const result = await $api<{ comparison: RegressionComparison | null }>(`/api/analyses/${props.analysisId}/comparison`);
    comparison.value = result.comparison;
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.message || "이전 분석과 비교하지 못했습니다.";
  } finally { loading.value = false; }
});
</script>

<template>
  <section class="section card report-section regression-comparison">
    <div class="section-head">
      <div><h2>이전 분석과 비교</h2><p v-if="comparison">{{ formatKoreanDateTime(comparison.baselineCreatedAt) }} 결과를 기준으로 달라진 항목을 표시합니다.</p><p v-else>같은 URL의 직전 완료 분석을 기준선으로 사용합니다.</p></div>
      <NuxtLink v-if="comparison" class="scenario-button" :to="`/analyses/${comparison.baselineAnalysisId}`">이전 보고서</NuxtLink>
    </div>
    <div v-if="loading" class="empty">비교할 이전 결과를 확인하고 있습니다.</div>
    <div v-else-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="!comparison" class="regression-empty"><strong>첫 기준 분석입니다.</strong><span>같은 URL을 다시 분석하면 이번 결과와의 변화를 확인할 수 있습니다.</span></div>
    <template v-else>
      <div class="regression-overview">
        <div class="regression-rate"><span>테스트 성공률</span><strong>{{ comparison.baselineSuccessRate }}% <i>→</i> {{ comparison.currentSuccessRate }}%</strong><em :class="{ positive: comparison.successRateDelta > 0, negative: comparison.successRateDelta < 0 }">{{ deltaLabel(comparison.successRateDelta) }}</em></div>
        <dl><div><dt>신규 실패</dt><dd>{{ comparison.newFailureCount }}</dd></div><div><dt>계속 실패</dt><dd>{{ comparison.persistentFailureCount }}</dd></div><div><dt>해결됨</dt><dd>{{ comparison.resolvedCount }}</dd></div><div><dt>시나리오 증감</dt><dd>+{{ comparison.addedScenarioCount }} / -{{ comparison.removedScenarioCount }}</dd></div></dl>
      </div>
      <div class="regression-toolbar" role="group" aria-label="비교 결과 필터"><button :class="{ active: filter === 'all' }" @click="filter = 'all'">전체 {{ comparison.changes.length }}</button><button :class="{ active: filter === 'changed' }" @click="filter = 'changed'">변경 {{ comparison.changes.filter(item => changedStatuses.has(item.status)).length }}</button><button :class="{ active: filter === 'issues' }" @click="filter = 'issues'">확인 필요 {{ comparison.changes.filter(item => issueStatuses.has(item.status)).length }}</button></div>
      <div v-if="visibleChanges.length" class="regression-list">
        <article v-for="item in visibleChanges" :key="item.key" class="regression-row">
          <span class="regression-status" :class="`regression-status--${statusMeta[item.status].tone}`">{{ statusMeta[item.status].label }}</span>
          <div><strong>{{ item.title }}</strong><small>{{ runLabel(item.baselineRunStatus) }} → {{ runLabel(item.currentRunStatus) }}</small></div>
        </article>
      </div>
      <div v-else class="empty">선택한 조건에 해당하는 변화가 없습니다.</div>
    </template>
  </section>
</template>

<style scoped>
.regression-comparison{overflow:hidden}.regression-overview{display:grid;grid-template-columns:minmax(220px,.8fr) 1.2fr;gap:12px;padding:16px;border:1px solid var(--line);border-radius:14px;background:#f8fafc}.regression-rate{display:grid;align-content:center;gap:5px;padding:4px 8px}.regression-rate span,.regression-rate em{color:var(--muted);font-size:11px;font-style:normal;font-weight:750}.regression-rate strong{font-size:24px}.regression-rate i{padding:0 4px;color:#94a3b8;font-style:normal}.regression-rate em.positive{color:#087f5b}.regression-rate em.negative{color:#c52b20}.regression-overview dl{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0}.regression-overview dl div{display:grid;gap:5px;padding:12px;border:1px solid #e7ebf0;border-radius:11px;background:#fff}.regression-overview dt{color:var(--muted);font-size:11px}.regression-overview dd{margin:0;font-size:18px;font-weight:800}.regression-toolbar{display:flex;gap:6px;margin:14px 0 10px}.regression-toolbar button{min-height:34px;padding:0 11px;border:1px solid var(--line);border-radius:9px;background:#fff;color:#526174;font-size:11px;font-weight:750;cursor:pointer}.regression-toolbar button.active{border-color:#25314b;background:#25314b;color:#fff}.regression-list{border:1px solid var(--line);border-radius:12px;overflow:hidden}.regression-row{display:grid;grid-template-columns:90px 1fr;align-items:center;gap:12px;padding:11px 13px;border-top:1px solid #edf1f5}.regression-row:first-child{border-top:0}.regression-row div{display:grid;min-width:0;gap:3px}.regression-row strong{font-size:12px;overflow-wrap:anywhere}.regression-row small{color:var(--muted);font-size:11px}.regression-status{justify-self:start;padding:4px 7px;border-radius:7px;background:#eef2f6;color:#526174;font-size:10px;font-weight:800}.regression-status--danger{background:#fff0ee;color:#c52b20}.regression-status--success{background:#e9f7f1;color:#087f5b}.regression-status--warning{background:#fff6df;color:#a46300}.regression-status--info{background:#eef3ff;color:#3954a4}.regression-empty{display:grid;gap:4px;padding:18px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:12px}.regression-empty strong{color:var(--ink);font-size:13px}
</style>
