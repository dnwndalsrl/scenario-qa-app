<script setup lang="ts">
import type { AutomatedTestRun, GeneratedTestScenario, QaDefect, QaDefectPriority, QaDefectSeverity, QaDefectStatus } from "~/shared/types/analysis";

const props = defineProps<{ analysisId: string; runs: AutomatedTestRun[]; tests: GeneratedTestScenario[] }>();
const emit = defineEmits<{ changed: [] }>();
const { $api } = useNuxtApp();
const defects = ref<QaDefect[]>([]);
const loading = ref(true);
const busyId = ref("");
const error = ref("");
const feedback = ref("");
const composingRunId = ref("");
const statusFilter = ref<"all" | QaDefectStatus>("all");
const noteDrafts = ref<Record<string, string>>({});
const form = reactive({ title: "", description: "", severity: "medium" as QaDefectSeverity, priority: "P2" as QaDefectPriority, assignee: "", note: "" });
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshDeadline = 0;

const statusOptions: Array<{ value: QaDefectStatus; label: string }> = [
  { value: "new", label: "신규" }, { value: "investigating", label: "확인 중" }, { value: "in_progress", label: "수정 중" },
  { value: "revalidation_requested", label: "재검증 요청" }, { value: "resolved", label: "해결" }, { value: "deferred", label: "보류" }
];
const statusLabel = (status: QaDefectStatus) => statusOptions.find((item) => item.value === status)?.label || status;
const testTitle = (scenarioId: string) => props.tests.find((test) => test.id === scenarioId)?.title || scenarioId;
const failedStatuses = new Set(["failed", "error", "blocked"]);
const currentFailedRuns = computed(() => {
  const seen = new Set<string>();
  return [...props.runs].reverse().filter((run) => {
    if (seen.has(run.scenarioId)) return false;
    seen.add(run.scenarioId);
    return failedStatuses.has(run.status);
  });
});
const unregisteredRuns = computed(() => currentFailedRuns.value.filter((run) => !defects.value.some((defect) => defect.sourceRunId === run.id)));
const visibleDefects = computed(() => statusFilter.value === "all" ? defects.value : defects.value.filter((defect) => defect.status === statusFilter.value));

function errorMessage(cause: any, fallback: string) { return cause?.data?.statusMessage || cause?.data?.message || cause?.message || fallback; }
async function loadDefects() {
  loading.value = true;
  try { defects.value = (await $api<{ defects: QaDefect[] }>(`/api/analyses/${props.analysisId}/defects`)).defects; }
  catch (cause) { error.value = errorMessage(cause, "결함 목록을 불러오지 못했습니다."); }
  finally { loading.value = false; }
}
function openComposer(run: AutomatedTestRun) {
  composingRunId.value = run.id;
  form.title = `[테스트 실패] ${testTitle(run.scenarioId)}`;
  form.description = run.error?.message || run.stepResults.find((step) => failedStatuses.has(step.status))?.errorMessage || "테스트 실행 결과를 확인해 주세요.";
  form.severity = run.failureKind === "product_defect" ? "high" : "medium";
  form.priority = run.failureKind === "product_defect" ? "P2" : "P3";
  form.assignee = ""; form.note = ""; error.value = ""; feedback.value = "";
}
async function createDefect() {
  if (!composingRunId.value) return;
  busyId.value = composingRunId.value;
  try {
    const result = await $api<{ defect: QaDefect }>(`/api/analyses/${props.analysisId}/defects`, { method: "POST", body: { runId: composingRunId.value, ...form } });
    defects.value.unshift(result.defect); composingRunId.value = ""; feedback.value = "결함을 등록했습니다."; error.value = "";
  } catch (cause) { error.value = errorMessage(cause, "결함 등록에 실패했습니다."); }
  finally { busyId.value = ""; }
}
async function saveDefect(defect: QaDefect, status?: QaDefectStatus) {
  busyId.value = defect.id;
  try {
    const result = await $api<{ defect: QaDefect }>(`/api/analyses/${props.analysisId}/defects/${defect.id}`, { method: "PUT", body: { status: status || defect.status, severity: defect.severity, priority: defect.priority, assignee: defect.assignee, note: noteDrafts.value[defect.id] || undefined } });
    defects.value = defects.value.map((item) => item.id === defect.id ? result.defect : item); noteDrafts.value[defect.id] = ""; feedback.value = "결함 정보를 저장했습니다."; error.value = "";
  } catch (cause) { error.value = errorMessage(cause, "결함 정보 저장에 실패했습니다."); }
  finally { busyId.value = ""; }
}
async function rerun(defect: QaDefect) {
  busyId.value = defect.id;
  let queued = false;
  try {
    await $api(`/api/analyses/${props.analysisId}/tests/${defect.scenarioId}/runs`, { method: "POST" });
    queued = true;
    const result = await $api<{ defect: QaDefect }>(`/api/analyses/${props.analysisId}/defects/${defect.id}`, { method: "PUT", body: { status: "revalidation_requested", note: "연결된 테스트의 재검증을 요청했습니다." } });
    defects.value = defects.value.map((item) => item.id === defect.id ? result.defect : item); feedback.value = "재검증을 실행 대기열에 등록했습니다."; error.value = "";
    refreshDeadline = Date.now() + 10 * 60 * 1000; scheduleRefresh(); emit("changed");
  } catch (cause) { error.value = queued ? `테스트는 실행 대기열에 등록됐지만 결함 상태를 갱신하지 못했습니다. ${errorMessage(cause, "상태를 직접 변경해 주세요.")}` : errorMessage(cause, "재검증 요청에 실패했습니다."); }
  finally { busyId.value = ""; }
}
function verified(defect: QaDefect) {
  const requested = [...defect.history].reverse().find((entry) => entry.status === "revalidation_requested");
  if (!requested) return false;
  return props.runs.some((run) => run.scenarioId === defect.scenarioId && run.status === "success" && Date.parse(run.completedAt || run.startedAt || "") >= Date.parse(requested.createdAt));
}
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (Date.now() >= refreshDeadline) return;
  refreshTimer = setTimeout(() => { emit("changed"); scheduleRefresh(); }, 3000);
}
function downloadCsv() {
  const rows = [["결함 ID", "제목", "상태", "심각도", "우선순위", "담당자", "대상 URL", "연결 시나리오", "등록일"], ...defects.value.map((defect) => [defect.id, defect.title, statusLabel(defect.status), defect.severity, defect.priority, defect.assignee, defect.targetUrl, defect.scenarioTitle, defect.createdAt])];
  const csv = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `probe-qa-defects-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
}
onMounted(loadDefects);
onBeforeUnmount(() => { if (refreshTimer) clearTimeout(refreshTimer); });
</script>

<template>
  <section class="section card report-section defect-section">
    <div class="section-head"><div><h2>결함 관리</h2><p>실패 결과를 업무 항목으로 등록하고 담당·처리·재검증 상태를 관리합니다.</p></div><div class="defect-head-actions"><span class="tag">미해결 {{ defects.filter(item => !['resolved','deferred'].includes(item.status)).length }}건</span><button type="button" class="scenario-button" :disabled="!defects.length" @click="downloadCsv">CSV 다운로드</button></div></div>
    <div v-if="error" class="error-box">{{ error }}</div><div v-if="feedback" class="notice">{{ feedback }}</div>
    <p v-if="loading" class="muted defect-empty">결함 목록을 불러오는 중입니다.</p>
    <template v-else>
      <div v-if="unregisteredRuns.length" class="defect-candidates"><strong>결함으로 등록 가능한 최근 실패</strong><div><button v-for="run in unregisteredRuns" :key="run.id" type="button" class="defect-candidate" @click="openComposer(run)"><span>{{ testTitle(run.scenarioId) }}</span><small>{{ run.error?.message || run.stepResults.find(step => failedStatuses.has(step.status))?.errorMessage || '실패 결과 확인 필요' }}</small><b>결함 등록</b></button></div></div>
      <form v-if="composingRunId" class="defect-form" @submit.prevent="createDefect"><div class="defect-form__head"><strong>실패 테스트를 결함으로 등록</strong><button type="button" @click="composingRunId = ''">닫기</button></div><label>제목<input v-model="form.title" required maxlength="160"></label><label>설명<textarea v-model="form.description" required maxlength="1000" rows="3" /></label><div class="defect-form__grid"><label>심각도<select v-model="form.severity"><option value="critical">치명적</option><option value="high">높음</option><option value="medium">보통</option><option value="low">낮음</option></select></label><label>우선순위<select v-model="form.priority"><option>P1</option><option>P2</option><option>P3</option><option>P4</option></select></label><label>담당자<input v-model="form.assignee" maxlength="100" placeholder="미지정"></label></div><label>초기 메모<textarea v-model="form.note" maxlength="1000" rows="2" /></label><div class="scenario-actions"><span class="scenario-spacer"/><button type="button" class="scenario-button" @click="composingRunId = ''">취소</button><button type="submit" class="scenario-button scenario-button--primary" :disabled="busyId === composingRunId">{{ busyId === composingRunId ? '등록 중…' : '결함 등록' }}</button></div></form>
      <div v-if="defects.length" class="defect-toolbar"><strong>등록된 결함</strong><select v-model="statusFilter"><option value="all">전체 상태</option><option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></div>
      <div v-if="visibleDefects.length" class="defect-list"><article v-for="defect in visibleDefects" :key="defect.id" class="defect-card"><header><div><span>{{ defect.priority }} · {{ defect.severity }}</span><h3>{{ defect.title }}</h3><p>{{ defect.scenarioTitle }} · {{ defect.targetUrl }}</p></div><span class="defect-status">{{ statusLabel(defect.status) }}</span></header><p class="defect-description">{{ defect.description }}</p><div class="defect-evidence"><strong>실패 근거</strong><span>{{ defect.failureSummary }}</span><small>실패 단계 {{ defect.failedStepOrders.join(', ') || '-' }} · 스크린샷 {{ defect.screenshotArtifactIds.length }}개</small></div><div v-if="verified(defect)" class="defect-verified">재검증에서 정상 동작을 확인했습니다. 확인 후 해결 처리할 수 있습니다.</div><div class="defect-controls"><label>상태<select v-model="defect.status"><option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><label>심각도<select v-model="defect.severity"><option value="critical">치명적</option><option value="high">높음</option><option value="medium">보통</option><option value="low">낮음</option></select></label><label>우선순위<select v-model="defect.priority"><option>P1</option><option>P2</option><option>P3</option><option>P4</option></select></label><label>담당자<input v-model="defect.assignee" maxlength="100" placeholder="미지정"></label></div><label class="defect-note">처리 메모<textarea v-model="noteDrafts[defect.id]" maxlength="1000" rows="2" placeholder="진행 상황이나 확인 내용을 남겨주세요." /></label><details v-if="defect.notes.length || defect.history.length" class="defect-history"><summary>메모·변경 이력 {{ defect.notes.length + defect.history.length }}건</summary><ul><li v-for="item in [...defect.history, ...defect.notes].sort((a,b) => a.createdAt.localeCompare(b.createdAt))" :key="item.id"><span>{{ new Date(item.createdAt).toLocaleString('ko-KR') }} · {{ item.author }}</span><p>{{ 'description' in item ? item.description : item.text }}</p></li></ul></details><div class="scenario-actions"><button type="button" class="scenario-button" :disabled="busyId === defect.id || defect.status === 'resolved'" @click="rerun(defect)">관련 테스트 다시 실행</button><span class="scenario-spacer"/><button v-if="verified(defect) && defect.status !== 'resolved'" type="button" class="scenario-button" :disabled="busyId === defect.id" @click="saveDefect(defect, 'resolved')">해결 처리</button><button type="button" class="scenario-button scenario-button--primary" :disabled="busyId === defect.id" @click="saveDefect(defect)">{{ busyId === defect.id ? '저장 중…' : '변경 저장' }}</button></div></article></div>
      <p v-else-if="!defects.length" class="muted defect-empty">등록된 결함이 없습니다. 실패 테스트에서 결함을 등록할 수 있습니다.</p><p v-else class="muted defect-empty">선택한 상태의 결함이 없습니다.</p>
    </template>
  </section>
</template>

<style scoped>
.defect-head-actions{display:flex;align-items:center;gap:8px}.defect-empty{padding:22px;text-align:center}.defect-candidates{display:grid;gap:10px;margin-bottom:18px;padding:16px;border:1px solid #e0e5ec;border-radius:13px;background:#f8fafc}.defect-candidates>strong{font-size:13px}.defect-candidates>div{display:grid;gap:7px}.defect-candidate{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 14px;padding:12px 13px;border:1px solid #dce3ec;border-radius:10px;background:#fff;text-align:left;cursor:pointer}.defect-candidate span{font-size:13px;font-weight:800}.defect-candidate small{overflow:hidden;color:var(--muted);text-overflow:ellipsis;white-space:nowrap}.defect-candidate b{grid-column:2;grid-row:1/3;align-self:center;color:#334155;font-size:12px}.defect-form{display:grid;gap:12px;margin-bottom:20px;padding:18px;border:1px solid #cfd8e5;border-radius:14px;background:#f8fafc}.defect-form__head,.defect-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px}.defect-form__head button{border:0;background:none;color:var(--muted);cursor:pointer}.defect-form label,.defect-controls label,.defect-note{display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:750}.defect-form input,.defect-form textarea,.defect-form select,.defect-controls input,.defect-controls select,.defect-note textarea,.defect-toolbar select{width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);font:inherit}.defect-form__grid,.defect-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.defect-form__grid{grid-template-columns:repeat(3,minmax(0,1fr))}.defect-toolbar{margin:16px 0 12px}.defect-toolbar select{width:auto;min-width:140px}.defect-list{display:grid;gap:12px}.defect-card{padding:18px;border:1px solid #dbe3ed;border-radius:14px;background:#fff}.defect-card header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.defect-card header span{color:var(--muted);font-size:11px;font-weight:750}.defect-card h3{margin:5px 0 0;font-size:16px}.defect-card header p{margin:5px 0 0;color:var(--muted);font-size:11px}.defect-status{flex:none;padding:5px 9px;border-radius:999px;background:#eef2f6;color:#334155!important}.defect-description{margin:14px 0;color:#475569;line-height:1.6}.defect-evidence{display:grid;gap:5px;padding:12px 13px;border-radius:10px;background:#f8fafc;font-size:12px}.defect-evidence span{color:#334155}.defect-evidence small{color:var(--muted)}.defect-verified{margin-top:10px;padding:10px 12px;border-radius:9px;background:#eef6f3;color:#256653;font-size:12px;font-weight:750}.defect-controls{margin-top:14px}.defect-note{margin-top:12px}.defect-history{margin-top:12px;border-top:1px solid #edf0f4}.defect-history summary{padding-top:12px;color:#475569;font-size:12px;font-weight:750;cursor:pointer}.defect-history ul{display:grid;gap:8px;margin:10px 0 0;padding:0;list-style:none}.defect-history li{padding:9px 10px;border-radius:8px;background:#f8fafc}.defect-history span{color:var(--muted);font-size:10px}.defect-history p{margin:4px 0 0;font-size:12px}.notice{margin-bottom:14px}@media(max-width:720px){.defect-head-actions{align-items:stretch;flex-direction:column}.defect-form__grid,.defect-controls{grid-template-columns:1fr 1fr}.defect-candidate{grid-template-columns:1fr}.defect-candidate b{grid-column:1;grid-row:auto}.defect-card header{flex-direction:column}}
</style>
