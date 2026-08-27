<script setup lang="ts">
import type { QaDefect, QaDefectPriority, QaDefectSeverity, QaDefectStatus } from "~/shared/types/analysis";
import { filterQaDefects, summarizeQaDefects } from "~/shared/utils/qa-defect-dashboard";

const { $api } = useNuxtApp();
const { data, error: loadError, status, refresh } = await useFetch<{ defects: QaDefect[] }>("/api/defects", { $fetch: $api, default: () => ({ defects: [] }) });
const defects = ref<QaDefect[]>([]);
const selectedId = ref("");
const busyId = ref("");
const feedback = ref("");
const actionError = ref("");
const noteDraft = ref("");
const filters = reactive({ query: "", status: "all" as "all" | QaDefectStatus, severity: "all" as "all" | QaDefectSeverity, assignee: "all" });

const statusOptions: Array<{ value: QaDefectStatus; label: string }> = [
  { value: "new", label: "신규" }, { value: "investigating", label: "확인 중" }, { value: "in_progress", label: "수정 중" },
  { value: "revalidation_requested", label: "재검증 요청" }, { value: "resolved", label: "해결" }, { value: "deferred", label: "보류" }
];
const severityOptions: Array<{ value: QaDefectSeverity; label: string }> = [
  { value: "critical", label: "치명적" }, { value: "high", label: "높음" }, { value: "medium", label: "보통" }, { value: "low", label: "낮음" }
];
const statusLabel = (value: QaDefectStatus) => statusOptions.find((item) => item.value === value)?.label || value;
const severityLabel = (value: QaDefectSeverity) => severityOptions.find((item) => item.value === value)?.label || value;
const summary = computed(() => summarizeQaDefects(defects.value));
const visibleDefects = computed(() => filterQaDefects(defects.value, filters));
const assignees = computed(() => [...new Set(defects.value.map((item) => item.assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko-KR")));
const selected = computed(() => defects.value.find((item) => item.id === selectedId.value));

watch(data, (value) => {
  defects.value = value?.defects || [];
  if (!defects.value.some((item) => item.id === selectedId.value)) selectedId.value = defects.value[0]?.id || "";
}, { immediate: true });
watch(visibleDefects, (items) => {
  if (items.length && !items.some((item) => item.id === selectedId.value)) selectedId.value = items[0]!.id;
}, { flush: "post" });

function errorMessage(cause: any, fallback: string) { return cause?.data?.statusMessage || cause?.data?.message || cause?.message || fallback; }
function clearFilters() { filters.query = ""; filters.status = "all"; filters.severity = "all"; filters.assignee = "all"; }
async function saveDefect(defect: QaDefect, statusOverride?: QaDefectStatus) {
  busyId.value = defect.id;
  try {
    const result = await $api<{ defect: QaDefect }>(`/api/analyses/${defect.analysisId}/defects/${defect.id}`, {
      method: "PUT",
      body: { status: statusOverride || defect.status, severity: defect.severity, priority: defect.priority, assignee: defect.assignee, note: noteDraft.value || undefined }
    });
    defects.value = defects.value.map((item) => item.id === defect.id ? result.defect : item);
    noteDraft.value = ""; feedback.value = statusOverride === "resolved" ? "결함을 해결 처리했습니다." : "결함 정보를 저장했습니다."; actionError.value = "";
  } catch (cause) { actionError.value = errorMessage(cause, "결함 정보 저장에 실패했습니다."); }
  finally { busyId.value = ""; }
}
async function rerun(defect: QaDefect) {
  busyId.value = defect.id;
  let queued = false;
  try {
    await $api(`/api/analyses/${defect.analysisId}/tests/${defect.scenarioId}/runs`, { method: "POST" });
    queued = true;
    const result = await $api<{ defect: QaDefect }>(`/api/analyses/${defect.analysisId}/defects/${defect.id}`, { method: "PUT", body: { status: "revalidation_requested", note: "통합 결함 화면에서 연결 테스트 재검증을 요청했습니다." } });
    defects.value = defects.value.map((item) => item.id === defect.id ? result.defect : item);
    feedback.value = "재검증을 실행 대기열에 등록했습니다."; actionError.value = "";
  } catch (cause) { actionError.value = queued ? `테스트는 등록됐지만 결함 상태를 갱신하지 못했습니다. ${errorMessage(cause, "상태를 직접 변경해 주세요.")}` : errorMessage(cause, "재검증 요청에 실패했습니다."); }
  finally { busyId.value = ""; }
}
function downloadCsv() {
  const rows = [["결함 ID", "제목", "상태", "심각도", "우선순위", "담당자", "대상 URL", "연결 시나리오", "등록일"], ...visibleDefects.value.map((defect) => [defect.id, defect.title, statusLabel(defect.status), severityLabel(defect.severity), defect.priority, defect.assignee, defect.targetUrl, defect.scenarioTitle, defect.createdAt])];
  const csv = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `probe-qa-defects-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="defect-dashboard">
    <div class="section-head defect-dashboard__head">
      <div><p class="eyebrow">Issue workspace</p><h1>결함 관리</h1><p>여러 분석에서 발견된 문제를 한곳에서 분류하고 재검증합니다.</p></div>
      <div class="defect-dashboard__actions"><button type="button" class="scenario-button" :disabled="!visibleDefects.length" @click="downloadCsv">현재 목록 CSV</button><button type="button" class="primary-button" @click="() => refresh()">새로고침</button></div>
    </div>

    <div class="defect-summary" aria-label="결함 요약">
      <article><span>전체 결함</span><strong>{{ summary.total }}</strong></article>
      <article><span>미해결</span><strong>{{ summary.unresolved }}</strong></article>
      <article><span>치명적·미해결</span><strong>{{ summary.critical }}</strong></article>
      <article><span>재검증 대기</span><strong>{{ summary.revalidationRequested }}</strong></article>
    </div>

    <section class="card defect-filter">
      <label class="defect-filter__search"><span>결함 검색</span><input v-model="filters.query" type="search" placeholder="제목, 시나리오, URL, 실패 내용 검색"></label>
      <label><span>상태</span><select v-model="filters.status"><option value="all">전체 상태</option><option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
      <label><span>심각도</span><select v-model="filters.severity"><option value="all">전체 심각도</option><option v-for="option in severityOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
      <label><span>담당자</span><select v-model="filters.assignee"><option value="all">전체 담당자</option><option v-for="assignee in assignees" :key="assignee" :value="assignee">{{ assignee }}</option></select></label>
      <button type="button" class="scenario-button" @click="clearFilters">초기화</button>
    </section>

    <div v-if="loadError" class="error-box" role="alert">통합 결함 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>
    <div v-if="actionError" class="error-box" role="alert">{{ actionError }}</div>
    <div v-if="feedback" class="notice">{{ feedback }}</div>
    <p v-if="status === 'pending'" class="empty">결함 목록을 불러오는 중입니다.</p>
    <div v-else-if="!defects.length" class="empty">등록된 결함이 없습니다. 분석 보고서의 실패 테스트에서 결함을 등록할 수 있습니다.</div>
    <div v-else-if="!visibleDefects.length" class="empty">조건에 맞는 결함이 없습니다. 필터를 변경해 주세요.</div>

    <div v-else class="defect-workspace">
      <section class="card defect-table" aria-label="결함 목록">
        <header><strong>결함 {{ visibleDefects.length }}건</strong><span>최근 등록순</span></header>
        <button v-for="defect in visibleDefects" :key="defect.id" type="button" :class="['defect-row', { 'is-selected': selectedId === defect.id }]" @click="selectedId = defect.id; noteDraft = ''; actionError = ''; feedback = ''">
          <span :class="['defect-row__severity', `is-${defect.severity}`]">{{ severityLabel(defect.severity) }}</span>
          <span class="defect-row__main"><strong>{{ defect.title }}</strong><small>{{ defect.scenarioTitle }}</small><small>{{ defect.targetUrl }}</small></span>
          <span class="defect-row__meta"><b>{{ statusLabel(defect.status) }}</b><small>{{ defect.assignee || '담당자 미지정' }}</small><small>{{ new Date(defect.updatedAt).toLocaleDateString('ko-KR') }}</small></span>
        </button>
      </section>

      <aside v-if="selected" class="card defect-detail">
        <header class="defect-detail__head"><div><span>{{ selected.priority }} · {{ severityLabel(selected.severity) }}</span><h2>{{ selected.title }}</h2><p>{{ selected.scenarioTitle }}</p></div><span class="defect-detail__status">{{ statusLabel(selected.status) }}</span></header>
        <div class="defect-detail__links"><NuxtLink :to="`/analyses/${selected.analysisId}`">원본 분석 보고서 보기 →</NuxtLink><a :href="selected.targetUrl" target="_blank" rel="noopener noreferrer">대상 페이지 열기 ↗</a></div>
        <p class="defect-detail__description">{{ selected.description }}</p>

        <section class="defect-proof"><strong>실패 근거</strong><p>{{ selected.failureSummary }}</p><small>실패 단계 {{ selected.failedStepOrders.join(', ') || '-' }} · 스크린샷 {{ selected.screenshotArtifactIds.length }}개</small><div v-if="selected.screenshotArtifactIds.length" class="defect-proof__images"><a v-for="artifactId in selected.screenshotArtifactIds" :key="artifactId" :href="`/api/analyses/${selected.analysisId}/artifacts/${artifactId}`" target="_blank"><img :src="`/api/analyses/${selected.analysisId}/artifacts/${artifactId}`" alt="결함 발생 시점 스크린샷"></a></div></section>

        <div class="defect-detail__controls">
          <label>상태<select v-model="selected.status"><option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          <label>심각도<select v-model="selected.severity"><option v-for="option in severityOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          <label>우선순위<select v-model="selected.priority"><option v-for="priority in (['P1','P2','P3','P4'] as QaDefectPriority[])" :key="priority">{{ priority }}</option></select></label>
          <label>담당자<input v-model="selected.assignee" maxlength="100" placeholder="미지정"></label>
        </div>
        <label class="defect-detail__note">처리 메모<textarea v-model="noteDraft" maxlength="1000" rows="3" placeholder="진행 상황이나 확인 내용을 남겨주세요."></textarea></label>
        <details v-if="selected.notes.length || selected.history.length" class="defect-detail__history"><summary>메모·변경 이력 {{ selected.notes.length + selected.history.length }}건</summary><ul><li v-for="item in [...selected.history, ...selected.notes].sort((a,b) => b.createdAt.localeCompare(a.createdAt))" :key="item.id"><span>{{ new Date(item.createdAt).toLocaleString('ko-KR') }} · {{ item.author }}</span><p>{{ 'description' in item ? item.description : item.text }}</p></li></ul></details>
        <div class="scenario-actions"><button type="button" class="scenario-button" :disabled="busyId === selected.id || selected.status === 'resolved'" @click="rerun(selected)">연결 테스트 재실행</button><span class="scenario-spacer"></span><button v-if="selected.status === 'revalidation_requested'" type="button" class="scenario-button" :disabled="busyId === selected.id" @click="saveDefect(selected, 'resolved')">해결 처리</button><button type="button" class="scenario-button scenario-button--primary" :disabled="busyId === selected.id" @click="saveDefect(selected)">{{ busyId === selected.id ? '저장 중…' : '변경 저장' }}</button></div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.defect-dashboard__head{align-items:flex-end}.defect-dashboard__head h1{font-size:44px}.defect-dashboard__actions{display:flex;gap:8px}.defect-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0 18px}.defect-summary article{padding:18px 20px;border:1px solid var(--line);border-radius:16px;background:#fff}.defect-summary span{display:block;color:var(--muted);font-size:12px;font-weight:750}.defect-summary strong{display:block;margin-top:7px;font-size:28px}.defect-filter{display:grid;grid-template-columns:minmax(260px,1fr) repeat(3,150px) auto;align-items:end;gap:10px;margin-bottom:18px;padding:16px 18px;border-radius:16px;box-shadow:none}.defect-filter label,.defect-detail__controls label,.defect-detail__note{display:grid;gap:6px;color:var(--muted);font-size:11px;font-weight:750}.defect-filter input,.defect-filter select,.defect-detail input,.defect-detail select,.defect-detail textarea{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);font:inherit}.defect-workspace{display:grid;grid-template-columns:minmax(0,.9fr) minmax(420px,1.1fr);align-items:start;gap:16px}.defect-table{overflow:hidden;border-radius:18px;box-shadow:none}.defect-table>header{display:flex;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line)}.defect-table>header span{color:var(--muted);font-size:11px}.defect-row{display:grid;width:100%;grid-template-columns:52px minmax(0,1fr) 106px;align-items:start;gap:12px;padding:16px 18px;border:0;border-bottom:1px solid #edf1f5;background:#fff;color:var(--ink);text-align:left;cursor:pointer}.defect-row:last-child{border-bottom:0}.defect-row:hover,.defect-row.is-selected{background:#f7f8fc}.defect-row.is-selected{box-shadow:inset 3px 0 0 var(--brand)}.defect-row__severity{padding:4px 6px;border-radius:999px;background:#edf1f5;color:#526174;font-size:10px;font-weight:800;text-align:center}.defect-row__severity.is-critical,.defect-row__severity.is-high{background:#feeceb;color:var(--danger)}.defect-row__main,.defect-row__meta{display:grid;min-width:0;gap:4px}.defect-row__main strong,.defect-row__main small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.defect-row__main strong{font-size:13px}.defect-row__main small,.defect-row__meta small{color:var(--muted);font-size:10px}.defect-row__meta{text-align:right}.defect-row__meta b{font-size:11px}.defect-detail{position:sticky;top:88px;padding:22px;border-radius:18px;box-shadow:none}.defect-detail__head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.defect-detail__head>div>span{color:var(--muted);font-size:11px;font-weight:750}.defect-detail__head h2{margin-top:6px;font-size:21px}.defect-detail__head p{margin:5px 0 0;color:var(--muted);font-size:12px}.defect-detail__status{flex:none;padding:5px 9px;border-radius:999px;background:#edf1f5;color:#334155;font-size:11px;font-weight:800}.defect-detail__links{display:flex;gap:16px;margin-top:16px;padding:11px 0;border-block:1px solid #edf1f5;font-size:12px;font-weight:750}.defect-detail__links a{color:#394961}.defect-detail__description{margin:16px 0;color:#475569;font-size:13px;line-height:1.65}.defect-proof{padding:14px;border-radius:12px;background:#f7f9fc}.defect-proof p{margin:7px 0;color:#334155;font-size:12px;line-height:1.55}.defect-proof small{color:var(--muted);font-size:10px}.defect-proof__images{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:11px}.defect-proof__images img{display:block;width:100%;height:86px;object-fit:cover;border:1px solid var(--line);border-radius:8px;background:#eef1f5}.defect-detail__controls{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:16px}.defect-detail__note{margin-top:12px}.defect-detail__history{margin-top:14px;border-top:1px solid #edf1f5}.defect-detail__history summary{padding-top:13px;color:#475569;font-size:12px;font-weight:750;cursor:pointer}.defect-detail__history ul{display:grid;gap:7px;margin:10px 0 0;padding:0;list-style:none}.defect-detail__history li{padding:9px 10px;border-radius:8px;background:#f7f9fc}.defect-detail__history span{color:var(--muted);font-size:10px}.defect-detail__history p{margin:4px 0 0;font-size:12px}.error-box,.notice{margin-bottom:14px}@media(max-width:920px){.defect-filter{grid-template-columns:1fr 1fr}.defect-filter__search{grid-column:1/-1}.defect-workspace{grid-template-columns:1fr}.defect-detail{position:static}}@media(max-width:640px){.defect-dashboard__head{align-items:flex-start;flex-direction:column}.defect-dashboard__actions{width:100%}.defect-summary{grid-template-columns:1fr 1fr}.defect-filter{grid-template-columns:1fr}.defect-filter__search{grid-column:auto}.defect-row{grid-template-columns:50px minmax(0,1fr)}.defect-row__meta{grid-column:2;text-align:left}.defect-detail__controls{grid-template-columns:1fr}.defect-proof__images{grid-template-columns:1fr 1fr}}
</style>
