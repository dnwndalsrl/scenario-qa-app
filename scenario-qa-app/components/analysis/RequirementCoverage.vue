<script setup lang="ts">
import type { AutomatedTestRun, GeneratedTestAction, GeneratedTestScenario, RequirementDocumentAnalysis } from "~/shared/types/analysis";
import { buildRequirementCoverage, type RequirementCoverageItem, type RequirementCoverageStatus } from "~/shared/utils/requirement-coverage";
import { testRunStatusLabel, testRunStatusTone } from "~/utils/test-run-status";

const props = defineProps<{ analysisId: string; document?: RequirementDocumentAnalysis; tests: GeneratedTestScenario[]; runs: AutomatedTestRun[]; canRun?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const { $api } = useNuxtApp();
const editingId = ref("");
const selectedTests = ref<Record<string, string[]>>({});
interface RequirementScenarioDraft {
  title: string; description: string; purpose: string; pageId?: string | null; requirementIds: string[];
  steps: Array<{ action: GeneratedTestAction; description: string; elementId?: string; value?: string; expected?: string; timeoutMs?: number }>;
}
const scenarioDrafts = ref<Record<string, RequirementScenarioDraft>>({});
const draftMeta = ref<Record<string, { summary: string; confidence: number }>>({});
const draftUnavailable = ref<Record<string, string>>({});
type DraftPreparationState = "queued" | "generating" | "completed" | "unavailable" | "error" | "saving";
const BATCH_LIMIT = 5;
const batchSelectedIds = ref<string[]>([]);
const approvedDraftIds = ref<string[]>([]);
const draftStates = ref<Record<string, DraftPreparationState>>({});
const draftErrors = ref<Record<string, string>>({});
const batchRunning = ref(false);
const batchSaving = ref(false);
const rtmDownloading = ref(false);
const busyId = ref("");
const feedback = ref<{ error: boolean; text: string }>();
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshDeadline = 0;

const coverage = computed(() => buildRequirementCoverage(props.document?.requirements || [], props.tests, props.runs));
const uncovered = computed(() => coverage.value.filter((item) => item.status === "uncovered"));
const batchCandidates = computed(() => uncovered.value.filter((item) => !scenarioDrafts.value[item.requirement.id]));
const draftIds = computed(() => coverage.value.map((item) => item.requirement.id).filter((id) => Boolean(scenarioDrafts.value[id])));
const approvedCount = computed(() => approvedDraftIds.value.filter((id) => Boolean(scenarioDrafts.value[id])).length);
const draftStateCounts = computed(() => Object.values(draftStates.value).reduce((counts, state) => ({ ...counts, [state]: (counts[state] || 0) + 1 }), {} as Partial<Record<DraftPreparationState, number>>));
const linkedCount = computed(() => coverage.value.filter((item) => item.tests.length).length);
const passedCount = computed(() => coverage.value.filter((item) => item.status === "passed").length);
const failedCount = computed(() => coverage.value.filter((item) => item.status === "failed").length);
const percent = (count: number) => coverage.value.length ? Math.round(count / coverage.value.length * 100) : 0;
const statusMeta: Record<RequirementCoverageStatus, { label: string; tone: string }> = {
  uncovered: { label: "테스트 없음", tone: "failed" }, not_run: { label: "실행 필요", tone: "warning" },
  running: { label: "실행 중", tone: "warning" }, passed: { label: "검증 성공", tone: "success" }, failed: { label: "검증 실패", tone: "failed" }
};
const priorityLabel = { high: "높음", medium: "보통", low: "낮음" } as const;
const actions: Array<{ value: GeneratedTestAction; label: string }> = [
  { value: "goto", label: "페이지 이동" }, { value: "scroll_to_ratio", label: "스크롤 비율 이동" }, { value: "scroll_by", label: "스크롤 이동" },
  { value: "scroll_into_view", label: "요소로 스크롤" }, { value: "wait_for_stable", label: "요소 안정화 대기" }, { value: "click", label: "클릭" },
  { value: "fill", label: "입력" }, { value: "select", label: "선택" }, { value: "press", label: "키 입력" }, { value: "check", label: "체크" }, { value: "uncheck", label: "체크 해제" },
  { value: "assert_url", label: "URL 확인" }, { value: "assert_title", label: "제목 확인" }, { value: "assert_visible", label: "표시 확인" },
  { value: "assert_hidden", label: "숨김 확인" }, { value: "assert_in_viewport", label: "화면 영역 확인" }, { value: "assert_scroll", label: "스크롤 결과 확인" },
  { value: "assert_enabled", label: "활성 상태 확인" }, { value: "assert_text", label: "텍스트 확인" }, { value: "assert_attribute", label: "속성 확인" },
  { value: "assert_value", label: "입력값 확인" }, { value: "assert_count", label: "개수 확인" }
];
const draftStateLabel: Record<DraftPreparationState, string> = { queued: "분석 대기", generating: "초안 생성 중", completed: "초안 완료", unavailable: "구현 확인 필요", error: "생성 오류", saving: "저장 중" };

function startEdit(item: RequirementCoverageItem) {
  selectedTests.value[item.requirement.id] = item.tests.map((test) => test.id);
  editingId.value = item.requirement.id;
  feedback.value = undefined;
}
function errorMessage(cause: any, fallback: string) { return cause?.data?.statusMessage || cause?.data?.message || cause?.message || fallback; }
async function downloadRequirementWorkbook() {
  rtmDownloading.value = true;
  feedback.value = undefined;
  try {
    const blob = await $api<Blob>(`/api/analyses/${props.analysisId}/requirements/export`, { responseType: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `probe-qa-requirement-traceability-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
    feedback.value = { error: false, text: "요구사항 추적표 엑셀 파일을 다운로드했습니다." };
  } catch (cause) {
    feedback.value = { error: true, text: errorMessage(cause, "요구사항 추적표 다운로드에 실패했습니다.") };
  } finally { rtmDownloading.value = false; }
}
async function saveLinks(item: RequirementCoverageItem) {
  const requirementId = item.requirement.id;
  const selected = new Set(selectedTests.value[requirementId] || []);
  const changed = props.tests.filter((test) => selected.has(test.id) !== Boolean(test.requirementIds?.includes(requirementId)));
  busyId.value = requirementId;
  feedback.value = undefined;
  try {
    await Promise.all(changed.map((test) => {
      const ids = new Set(test.requirementIds || []);
      if (selected.has(test.id)) ids.add(requirementId); else ids.delete(requirementId);
      return $api(`/api/analyses/${props.analysisId}/tests/${test.id}/requirements`, { method: "PUT", body: { requirementIds: [...ids] } });
    }));
    editingId.value = "";
    feedback.value = { error: false, text: changed.length ? "요구사항과 테스트 시나리오 연결을 저장했습니다." : "변경된 연결이 없습니다." };
    emit("changed");
  } catch (cause) {
    feedback.value = { error: true, text: errorMessage(cause, "요구사항 연결을 저장하지 못했습니다.") };
  } finally { busyId.value = ""; }
}
async function runLinkedTests(item: RequirementCoverageItem) {
  const executable = item.tests.filter((test) => test.safetyLevel === "safe" && test.autoExecutable);
  if (!executable.length) {
    feedback.value = { error: true, text: "자동 실행할 수 있는 안전한 연결 시나리오가 없습니다." };
    return;
  }
  busyId.value = item.requirement.id;
  feedback.value = undefined;
  try {
    await Promise.all(executable.map((test) => $api(`/api/analyses/${props.analysisId}/tests/${test.id}/runs`, { method: "POST" })));
    feedback.value = { error: false, text: `연결된 테스트 ${executable.length}개를 실행 대기열에 등록했습니다.` };
    refreshDeadline = Date.now() + 10 * 60 * 1000;
    scheduleRefresh();
    emit("changed");
  } catch (cause) {
    feedback.value = { error: true, text: errorMessage(cause, "연결된 테스트를 실행하지 못했습니다.") };
  } finally { busyId.value = ""; }
}
async function createDraft(item: RequirementCoverageItem, quiet = false): Promise<DraftPreparationState> {
  const id = item.requirement.id;
  busyId.value = id;
  draftStates.value[id] = "generating";
  if (!quiet) feedback.value = undefined;
  delete draftUnavailable.value[id];
  delete draftErrors.value[id];
  try {
    const result = await $api<any>(`/api/analyses/${props.analysisId}/requirements/${encodeURIComponent(id)}/draft`, { method: "POST" });
    if (!result.verificationPossible) {
      draftUnavailable.value[id] = result.reason || "검증 가능한 페이지 근거를 찾지 못했습니다.";
      draftStates.value[id] = "unavailable";
      return "unavailable";
    }
    scenarioDrafts.value[id] = result.draft;
    draftMeta.value[id] = { summary: result.summary, confidence: result.confidence };
    if (!approvedDraftIds.value.includes(id)) approvedDraftIds.value.push(id);
    draftStates.value[id] = "completed";
    return "completed";
  } catch (cause) {
    const message = errorMessage(cause, "요구사항 시나리오 초안을 만들지 못했습니다.");
    draftErrors.value[id] = message;
    draftStates.value[id] = "error";
    if (!quiet) feedback.value = { error: true, text: message };
    return "error";
  } finally { if (busyId.value === id) busyId.value = ""; }
}
async function saveDraft(item: RequirementCoverageItem) {
  const id = item.requirement.id;
  const draft = scenarioDrafts.value[id];
  if (!draft) return;
  busyId.value = id;
  draftStates.value[id] = "saving";
  feedback.value = undefined;
  try {
    await $api(`/api/analyses/${props.analysisId}/tests`, { method: "POST", body: draft });
    delete scenarioDrafts.value[id];
    delete draftMeta.value[id];
    delete draftStates.value[id];
    delete draftErrors.value[id];
    approvedDraftIds.value = approvedDraftIds.value.filter((value) => value !== id);
    feedback.value = { error: false, text: "검토한 시나리오를 저장하고 요구사항에 연결했습니다. 자동 실행하지 않았습니다." };
    emit("changed");
  } catch (cause) {
    draftStates.value[id] = "error";
    feedback.value = { error: true, text: errorMessage(cause, "시나리오를 저장하지 못했습니다.") };
  } finally { busyId.value = ""; }
}
function cancelDraft(id: string) {
  delete scenarioDrafts.value[id];
  delete draftMeta.value[id];
  delete draftStates.value[id];
  delete draftErrors.value[id];
  approvedDraftIds.value = approvedDraftIds.value.filter((value) => value !== id);
}
function removeDraftStep(id: string, index: number) {
  if ((scenarioDrafts.value[id]?.steps.length || 0) > 1) scenarioDrafts.value[id]!.steps.splice(index, 1);
}
function usesExpected(action: GeneratedTestAction) { return ["assert_url", "assert_title", "assert_text", "assert_scroll", "assert_attribute", "assert_value", "assert_count"].includes(action); }
function toggleBatchSelection() {
  const candidateIds = batchCandidates.value.map((item) => item.requirement.id).slice(0, BATCH_LIMIT);
  batchSelectedIds.value = batchSelectedIds.value.length ? [] : candidateIds;
}
function selectionDisabled(id: string) {
  return batchRunning.value || !batchSelectedIds.value.includes(id) && batchSelectedIds.value.length >= BATCH_LIMIT;
}
async function generateSelectedDrafts() {
  const selected = batchSelectedIds.value.slice(0, BATCH_LIMIT);
  if (!selected.length) return;
  batchRunning.value = true;
  feedback.value = undefined;
  selected.forEach((id) => { draftStates.value[id] = "queued"; });
  const results: DraftPreparationState[] = [];
  for (const id of selected) {
    const item = coverage.value.find((entry) => entry.requirement.id === id);
    if (item) results.push(await createDraft(item, true));
  }
  const completed = results.filter((state) => state === "completed").length;
  const unavailable = results.filter((state) => state === "unavailable").length;
  const errors = results.filter((state) => state === "error").length;
  feedback.value = { error: Boolean(errors), text: `초안 ${completed}개 완료${unavailable ? ` · 구현 확인 필요 ${unavailable}개` : ""}${errors ? ` · 오류 ${errors}개` : ""}. 저장할 초안을 검토해 주세요.` };
  batchSelectedIds.value = [];
  batchRunning.value = false;
}
async function saveApprovedDrafts() {
  const ids = approvedDraftIds.value.filter((id) => Boolean(scenarioDrafts.value[id]));
  if (!ids.length) return;
  batchSaving.value = true;
  feedback.value = undefined;
  const failed: string[] = [];
  let saved = 0;
  for (const id of ids) {
    draftStates.value[id] = "saving";
    try {
      await $api(`/api/analyses/${props.analysisId}/tests`, { method: "POST", body: scenarioDrafts.value[id] });
      delete scenarioDrafts.value[id];
      delete draftMeta.value[id];
      delete draftStates.value[id];
      delete draftErrors.value[id];
      saved++;
    } catch (cause) {
      draftStates.value[id] = "error";
      draftErrors.value[id] = errorMessage(cause, "시나리오를 저장하지 못했습니다.");
      failed.push(id);
    }
  }
  approvedDraftIds.value = failed;
  batchSaving.value = false;
  feedback.value = { error: Boolean(failed.length), text: `승인한 초안 ${saved}개를 저장했습니다${failed.length ? ` · 저장 실패 ${failed.length}개` : ""}. 자동 실행하지 않았습니다.` };
  if (saved) emit("changed");
}
function moveDraft(currentId: string, direction: -1 | 1) {
  const current = draftIds.value.indexOf(currentId);
  const target = draftIds.value[current + direction];
  if (target) document.getElementById(`requirement-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (Date.now() >= refreshDeadline) return;
  refreshTimer = setTimeout(() => { emit("changed"); scheduleRefresh(); }, 3000);
}
function latestRun(testId: string) { return [...props.runs].reverse().find((run) => run.scenarioId === testId); }
onBeforeUnmount(() => { if (refreshTimer) clearTimeout(refreshTimer); });
</script>

<template>
  <section v-if="document?.status === 'completed' && document.requirements.length" class="section card report-section requirement-coverage">
    <div class="section-head"><div><h2>요구사항 커버리지</h2><p>문서 요구사항이 어떤 테스트로 검증됐는지 추적합니다.</p></div><div class="scenario-actions scenario-actions--head"><span class="tag">{{ linkedCount }}/{{ coverage.length }}개 연결</span><button type="button" class="scenario-button scenario-button--download" :disabled="rtmDownloading" @click="downloadRequirementWorkbook">{{ rtmDownloading ? '엑셀 생성 중…' : '요구사항 추적표 다운로드' }}</button></div></div>
    <div class="coverage-summary">
      <div><span>시나리오 연결률</span><strong>{{ percent(linkedCount) }}%</strong><small>테스트가 연결된 요구사항</small></div>
      <div><span>검증 완료율</span><strong>{{ percent(passedCount) }}%</strong><small>최신 실행이 모두 성공한 요구사항</small></div>
      <div><span>확인 필요</span><strong>{{ coverage.length - passedCount }}</strong><small>미연결·미실행·실패 포함</small></div>
      <div><span>검증 실패</span><strong>{{ failedCount }}</strong><small>최신 테스트에서 실패 발견</small></div>
    </div>
    <div v-if="uncovered.length" class="coverage-batch">
      <div><strong>미검증 요구사항 일괄 준비</strong><p>최대 {{ BATCH_LIMIT }}개를 순차 분석합니다. 초안은 검토 후 선택한 항목만 저장되며 자동 실행되지 않습니다.</p></div>
      <div class="coverage-batch__actions"><span>{{ batchSelectedIds.length }}/{{ BATCH_LIMIT }}개 선택</span><button type="button" class="scenario-button" :disabled="batchRunning || !batchCandidates.length" @click="toggleBatchSelection">{{ batchSelectedIds.length ? '선택 해제' : '최대 5개 선택' }}</button><button type="button" class="scenario-button scenario-button--primary" :disabled="batchRunning || !batchSelectedIds.length" @click="generateSelectedDrafts">{{ batchRunning ? '순차 생성 중…' : '선택 항목 초안 생성' }}</button><button v-if="approvedCount" type="button" class="scenario-button" :disabled="batchRunning || batchSaving" @click="saveApprovedDrafts">{{ batchSaving ? '일괄 저장 중…' : `승인한 초안 ${approvedCount}개 저장` }}</button></div>
      <div v-if="Object.keys(draftStateCounts).length" class="coverage-batch__states"><span v-for="(count,state) in draftStateCounts" :key="state">{{ draftStateLabel[state] }} {{ count }}</span></div>
    </div>
    <div v-if="feedback" :class="feedback.error ? 'error-box' : 'notice'">{{ feedback.text }}</div>
    <div class="coverage-list">
      <article v-for="item in coverage" :id="`requirement-${item.requirement.id}`" :key="item.requirement.id" :class="`coverage-card coverage-card--${item.status}`">
        <header><div class="coverage-card-title"><label v-if="item.status === 'uncovered' && !scenarioDrafts[item.requirement.id]" class="coverage-select"><input v-model="batchSelectedIds" type="checkbox" :value="item.requirement.id" :disabled="selectionDisabled(item.requirement.id)"><span class="sr-only">{{ item.requirement.title }} 일괄 생성 선택</span></label><div><span>{{ item.requirement.id }} · 우선순위 {{ priorityLabel[item.requirement.priority] }}</span><h3>{{ item.requirement.title }}</h3></div></div><div class="coverage-status-stack"><span class="tag" :class="`tag--${statusMeta[item.status].tone}`">{{ statusMeta[item.status].label }}</span><span v-if="draftStates[item.requirement.id]" class="tag">{{ draftStateLabel[draftStates[item.requirement.id]!] }}</span></div></header>
        <p>{{ item.requirement.expectedBehavior }}</p>
        <small>{{ item.requirement.sourceReference }}</small>
        <div v-if="item.tests.length" class="coverage-tests"><strong>연결된 테스트 {{ item.tests.length }}개</strong><a v-for="test in item.tests" :key="test.id" :href="`#scenario-${test.id}`"><span>{{ test.title }}</span><span v-if="latestRun(test.id)" class="tag" :class="`tag--${testRunStatusTone(latestRun(test.id)! )}`">{{ testRunStatusLabel(latestRun(test.id)!) }}</span><span v-else class="tag">미실행</span></a></div>
        <div v-else class="coverage-missing">이 요구사항을 검증하는 테스트 시나리오가 없습니다.</div>
        <div v-if="draftUnavailable[item.requirement.id]" class="coverage-draft-unavailable"><strong>구현 확인 필요</strong><span>{{ draftUnavailable[item.requirement.id] }}</span><button type="button" @click="delete draftUnavailable[item.requirement.id]">닫기</button></div>
        <div v-if="draftErrors[item.requirement.id]" class="error-box">{{ draftErrors[item.requirement.id] }}</div>
        <form v-if="scenarioDrafts[item.requirement.id]" class="scenario-editor coverage-draft" @submit.prevent="saveDraft(item)">
          <div class="coverage-draft__head"><div><strong>AI 시나리오 초안</strong><span>신뢰도 {{ Math.round((draftMeta[item.requirement.id]?.confidence || 0) * 100) }}%</span></div><p>{{ draftMeta[item.requirement.id]?.summary }}</p><small>저장하기 전 내용을 검토하세요. 저장해도 자동 실행되지 않습니다.</small><div class="coverage-draft__review"><label><input v-model="approvedDraftIds" type="checkbox" :value="item.requirement.id"> 일괄 저장 대상으로 승인</label><div><button type="button" class="scenario-button" :disabled="draftIds.indexOf(item.requirement.id) <= 0" @click="moveDraft(item.requirement.id,-1)">이전 초안</button><button type="button" class="scenario-button" :disabled="draftIds.indexOf(item.requirement.id) >= draftIds.length - 1" @click="moveDraft(item.requirement.id,1)">다음 초안</button></div></div></div>
          <label>제목<input v-model="scenarioDrafts[item.requirement.id]!.title" required maxlength="160"></label>
          <label>설명<textarea v-model="scenarioDrafts[item.requirement.id]!.description" maxlength="500" rows="2" /></label>
          <label>검증 목적<textarea v-model="scenarioDrafts[item.requirement.id]!.purpose" maxlength="500" rows="2" /></label>
          <fieldset v-for="(step,index) in scenarioDrafts[item.requirement.id]!.steps" :key="index" class="coverage-draft-step">
            <legend>{{ index + 1 }}단계 · {{ step.action.startsWith('assert_') ? '예상 결과' : '실행 동작' }}</legend>
            <label>동작<select v-model="step.action"><option v-for="action in actions" :key="action.value" :value="action.value">{{ action.label }}</option></select></label>
            <label>설명<input v-model="step.description" required maxlength="300"></label>
            <label>대상 요소 ID<input v-model="step.elementId" maxlength="100" placeholder="요소가 필요 없는 동작은 비워두세요"></label>
            <label>입력값·조건<input v-model="step.value" maxlength="500"></label>
            <label v-if="usesExpected(step.action)">예상값<input v-model="step.expected" maxlength="500"></label>
            <button type="button" class="scenario-button" :disabled="scenarioDrafts[item.requirement.id]!.steps.length === 1" @click="removeDraftStep(item.requirement.id,index)">단계 삭제</button>
          </fieldset>
          <div class="scenario-actions"><button type="button" class="scenario-button" :disabled="batchSaving" @click="cancelDraft(item.requirement.id)">취소</button><button type="submit" class="scenario-button scenario-button--primary" :disabled="busyId === item.requirement.id || batchSaving">{{ busyId === item.requirement.id ? '저장 중…' : '검토 완료·개별 저장' }}</button></div>
        </form>
        <div v-if="editingId === item.requirement.id" class="coverage-editor"><strong>연결할 시나리오 선택</strong><div><label v-for="test in tests" :key="test.id"><input v-model="selectedTests[item.requirement.id]" type="checkbox" :value="test.id"><span>{{ test.title }}</span></label></div><div class="scenario-actions"><button type="button" class="scenario-button" @click="editingId = ''">취소</button><button type="button" class="scenario-button scenario-button--primary" :disabled="busyId === item.requirement.id" @click="saveLinks(item)">{{ busyId === item.requirement.id ? '저장 중…' : '연결 저장' }}</button></div></div>
        <div v-else-if="!scenarioDrafts[item.requirement.id]" class="scenario-actions"><button v-if="item.status === 'uncovered'" type="button" class="scenario-button scenario-button--primary" :disabled="batchRunning || busyId === item.requirement.id" @click="createDraft(item)">{{ busyId === item.requirement.id ? '근거 분석 중…' : draftStates[item.requirement.id] === 'error' ? '초안 다시 만들기' : 'AI 시나리오 초안 만들기' }}</button><button type="button" class="scenario-button" :disabled="batchRunning || !tests.length" @click="startEdit(item)">연결 수정</button><button v-if="canRun && item.tests.length" type="button" class="scenario-button scenario-button--primary" :disabled="batchRunning || busyId === item.requirement.id || item.status === 'running'" @click="runLinkedTests(item)">{{ busyId === item.requirement.id ? '요청 중…' : '연결 테스트 실행' }}</button></div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.coverage-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}.coverage-summary>div{display:grid;gap:5px;padding:15px;border:1px solid #e0e6ee;border-radius:12px;background:#f8fafc}.coverage-summary span,.coverage-summary small{color:var(--muted);font-size:11px}.coverage-summary strong{font-size:24px}.coverage-list{display:grid;gap:12px}.coverage-card{padding:18px;border:1px solid #dce3ec;border-left:4px solid #aeb8c6;border-radius:13px;background:#fff}.coverage-card--passed{border-left-color:#4f8a76}.coverage-card--failed,.coverage-card--uncovered{border-left-color:#bd5d56}.coverage-card--running,.coverage-card--not_run{border-left-color:#b58a42}.coverage-card header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.coverage-card header>div{min-width:0}.coverage-card header span{color:var(--muted);font-size:11px;font-weight:750}.coverage-card h3{margin:5px 0 0;font-size:16px}.coverage-card>p{margin:12px 0 5px;color:#425168;line-height:1.6}.coverage-card>small{color:var(--muted)}.coverage-tests{display:grid;gap:7px;margin-top:14px;padding:12px;border-radius:10px;background:#f7f9fb}.coverage-tests>strong{font-size:12px}.coverage-tests>a{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border:1px solid #e0e6ee;border-radius:8px;background:#fff;color:var(--ink);font-size:12px;font-weight:750}.coverage-missing{margin-top:14px;padding:11px 12px;border-radius:9px;background:#fff3f1;color:#9c3f38;font-size:12px;font-weight:750}.coverage-editor{display:grid;gap:10px;margin-top:14px;padding:14px;border:1px solid #dce3ec;border-radius:10px;background:#f8fafc}.coverage-editor>strong{font-size:12px}.coverage-editor>div:nth-child(2){display:grid;max-height:230px;overflow:auto;gap:6px}.coverage-editor label{display:flex;align-items:flex-start;gap:8px;padding:8px 9px;border-radius:7px;background:#fff;font-size:12px;cursor:pointer}.coverage-editor input{margin-top:2px}.coverage-editor .scenario-actions{justify-content:flex-end;margin-top:2px}.coverage-draft-unavailable{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;margin-top:12px;padding:12px;border:1px solid #e5c98d;border-radius:9px;background:#fff9ed;color:#725019;font-size:12px}.coverage-draft-unavailable button{border:0;background:none;color:inherit;cursor:pointer}.coverage-draft{margin-top:14px;padding:15px;border:1px solid #cad4e1;border-radius:11px;background:#f8fafc}.coverage-draft__head{display:grid;gap:5px;padding-bottom:12px;border-bottom:1px solid #dce3ec}.coverage-draft__head>div{display:flex;align-items:center;justify-content:space-between;gap:12px}.coverage-draft__head p{margin:0;color:#425168}.coverage-draft__head small{color:var(--muted)}.coverage-draft-step{display:grid;grid-template-columns:minmax(140px,.7fr) minmax(220px,1.3fr);gap:10px;padding:12px;border:1px solid #dce3ec;border-radius:9px;background:#fff}.coverage-draft-step legend{padding:0 6px;font-size:12px;font-weight:800}.coverage-draft-step .scenario-button{align-self:end}.coverage-draft>.scenario-actions{justify-content:flex-end}@media(max-width:760px){.coverage-summary{grid-template-columns:1fr 1fr}.coverage-draft-step{grid-template-columns:1fr}}@media(max-width:480px){.coverage-summary{grid-template-columns:1fr}.coverage-card header{flex-direction:column}.coverage-tests>a{align-items:flex-start;flex-direction:column}.coverage-draft-unavailable{grid-template-columns:1fr}.coverage-draft__head>div{align-items:flex-start;flex-direction:column}}
.coverage-batch{display:grid;gap:12px;margin-bottom:18px;padding:16px;border:1px solid #d6dee9;border-radius:12px;background:#f8fafc}.coverage-batch>div:first-child{display:grid;gap:4px}.coverage-batch>div:first-child p{margin:0;color:var(--muted);font-size:12px;line-height:1.5}.coverage-batch__actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.coverage-batch__actions>span{margin-right:auto;color:#425168;font-size:12px;font-weight:750}.coverage-batch__states{display:flex;flex-wrap:wrap;gap:6px;padding-top:10px;border-top:1px solid #e0e6ee}.coverage-batch__states span{padding:5px 8px;border-radius:999px;background:#e9eef4;color:#425168;font-size:11px;font-weight:750}.coverage-card-title{display:flex;align-items:flex-start;gap:10px}.coverage-card-title>div{min-width:0}.coverage-select{display:grid;flex:0 0 24px;width:24px;height:24px;place-items:center;border:1px solid #c9d3df;border-radius:7px;background:#f8fafc;cursor:pointer}.coverage-select input{width:14px;height:14px;margin:0}.coverage-status-stack{display:flex;align-items:flex-end!important;flex-direction:column;gap:5px}.coverage-draft__review{margin-top:7px;padding-top:10px;border-top:1px solid #dce3ec}.coverage-draft__review>label{display:flex;align-items:center;gap:7px;color:#26364d}.coverage-draft__review>label input{width:auto;margin:0}.coverage-draft__review>div{display:flex;gap:6px}.coverage-draft__review .scenario-button{min-height:30px;padding:0 9px;font-size:11px}.coverage-card>.error-box{margin-top:12px}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:760px){.coverage-batch__actions{align-items:stretch;flex-direction:column}.coverage-batch__actions>span{margin-right:0}.coverage-batch__actions .scenario-button{width:100%}.coverage-draft__review{align-items:flex-start!important;flex-direction:column}.coverage-draft__review>div{width:100%}.coverage-draft__review .scenario-button{flex:1}}@media(max-width:480px){.coverage-card-title{width:100%}.coverage-status-stack{align-items:flex-start!important;flex-direction:row;flex-wrap:wrap}}
</style>
