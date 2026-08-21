<script setup lang="ts">
import type { AutomatedTestRun, GeneratedTestAction, GeneratedTestScenario, PageSnapshot } from "~/shared/types/analysis";
import { uiLabel } from "~/utils/ui-label";

interface EditableStep {
  action: GeneratedTestAction;
  description: string;
  elementId?: string;
  value?: string;
  expected?: string;
  timeoutMs?: number;
}
interface EditorDraft { title: string; description: string; purpose: string; steps: EditableStep[] }

const props = withDefaults(defineProps<{
  analysisId: string;
  tests: GeneratedTestScenario[];
  snapshot: PageSnapshot;
  runs?: AutomatedTestRun[];
  compact?: boolean;
  reviewMode?: boolean;
}>(), { runs: () => [], compact: false, reviewMode: false });
const emit = defineEmits<{ changed: [] }>();
const { $api } = useNuxtApp();
const editingId = ref("");
const busyId = ref("");
const drafts = ref<Record<string, EditorDraft>>({});
const feedback = ref("");
const feedbackError = ref(false);
const activeRunId = ref("");
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshDeadline = 0;

const actions: Array<{ value: GeneratedTestAction; label: string }> = [
  { value: "goto", label: "페이지 접속" },
  { value: "scroll_to_ratio", label: "페이지 비율로 스크롤" },
  { value: "scroll_by", label: "현재 위치에서 스크롤" },
  { value: "scroll_into_view", label: "대상 요소로 스크롤" },
  { value: "wait_for_stable", label: "요소 안정화 대기" },
  { value: "click", label: "클릭" },
  { value: "assert_in_viewport", label: "화면 안에 표시 확인" },
  { value: "assert_scroll", label: "스크롤 결과 확인" },
  { value: "assert_visible", label: "표시 확인" },
  { value: "assert_hidden", label: "숨김 확인" },
  { value: "assert_enabled", label: "활성 상태 확인" },
  { value: "assert_text", label: "텍스트 확인" },
  { value: "assert_attribute", label: "속성 상태 확인" },
  { value: "assert_value", label: "입력값 확인" },
  { value: "assert_count", label: "요소 개수 확인" },
  { value: "assert_url", label: "URL 확인" },
  { value: "assert_title", label: "페이지 제목 확인" },
  { value: "fill", label: "입력" },
  { value: "select", label: "선택" },
  { value: "press", label: "키 입력" },
  { value: "check", label: "체크" },
  { value: "uncheck", label: "체크 해제" }
];
const noElementActions = new Set<GeneratedTestAction>(["goto", "scroll_to_ratio", "scroll_by", "assert_url", "assert_title", "assert_scroll"]);

function elementLabel(id: string) {
  const element = props.snapshot.elements.find((item) => item.id === id);
  return element ? `${id} · ${element.accessibleName || element.text || element.type}` : id;
}
function needsElement(action: GeneratedTestAction) { return !noElementActions.has(action); }
function latestRun(testId: string) { return [...props.runs].reverse().find((run) => run.scenarioId === testId); }
function runIsActive(testId: string) { return ["pending", "running"].includes(latestRun(testId)?.status || ""); }
function actionLabel(action: GeneratedTestAction) { return actions.find((item) => item.value === action)?.label || action; }
function isAssertion(action: GeneratedTestAction) { return action.startsWith("assert_"); }
function executionSteps(test: GeneratedTestScenario) { return test.steps.filter((step) => !isAssertion(step.action)); }
function expectedSteps(test: GeneratedTestScenario) { return test.steps.filter((step) => isAssertion(step.action)); }
function expectedLabel(step: GeneratedTestScenario["steps"][number]) {
  if (!step.expected) return step.description;
  if (step.action === "assert_attribute") return `${step.description} · ${step.value}: ${step.expected}`;
  return `${step.description} · 기대값: ${step.expected.replace(/^url(?:-prefix)?:/, "")}`;
}
function valueLabel(action: GeneratedTestAction) {
  if (action === "scroll_to_ratio") return "스크롤 비율(0~100)";
  if (action === "scroll_by") return "이동 픽셀(위쪽은 음수)";
  if (action === "wait_for_stable") return "안정 유지 시간(ms, 선택)";
  if (action === "assert_attribute") return "속성명(예: aria-expanded)";
  return ["fill", "select", "press"].includes(action) ? "입력값" : "";
}
function defaultElementId() {
  return props.snapshot.elements.find((element) => element.locatorCandidates.some((candidate) => candidate.unique))?.id;
}
function startEdit(test: GeneratedTestScenario) {
  drafts.value[test.id] = {
    title: test.title, description: test.description, purpose: test.purpose,
    steps: test.steps.map((step) => ({
      action: step.action, description: step.description, elementId: step.elementId,
      value: step.value, expected: step.expected, timeoutMs: step.timeoutMs
    }))
  };
  editingId.value = test.id;
  feedback.value = "";
}
function startAdd() {
  drafts.value.__new = { title: "", description: "", purpose: "", steps: [{ action: "assert_visible", description: "대상 요소가 표시되는지 확인", elementId: defaultElementId() }] };
  editingId.value = "__new";
  feedback.value = "";
}
function cancelEdit() { editingId.value = ""; }
function addStep(testId: string) {
  drafts.value[testId]?.steps.push({ action: "assert_visible", description: "대상 요소가 표시되는지 확인", elementId: defaultElementId() });
}
function removeStep(testId: string, index: number) {
  if ((drafts.value[testId]?.steps.length || 0) > 1) drafts.value[testId]?.steps.splice(index, 1);
}
function onActionChanged(step: EditableStep) {
  if (!needsElement(step.action)) step.elementId = undefined;
}
function errorMessage(cause: any, fallback: string) {
  return cause?.data?.statusMessage || cause?.data?.message || cause?.message || fallback;
}
async function save(testId: string) {
  const draft = drafts.value[testId];
  if (!draft) return;
  busyId.value = testId;
  feedback.value = "";
  try {
    const target = testId === "__new" ? `/api/analyses/${props.analysisId}/tests` : `/api/analyses/${props.analysisId}/tests/${testId}`;
    await $api(target, { method: testId === "__new" ? "POST" : "PUT", body: testId === "__new" ? { ...draft, pageId: props.snapshot.pageId || null } : draft });
    editingId.value = "";
    feedbackError.value = false;
    feedback.value = "테스트 시나리오를 저장했습니다.";
    emit("changed");
  } catch (cause) {
    feedbackError.value = true;
    feedback.value = errorMessage(cause, "테스트 시나리오 저장에 실패했습니다.");
  } finally { busyId.value = ""; }
}
async function rerun(testId: string) {
  busyId.value = testId;
  feedback.value = "";
  try {
    const result = await $api<{ runId: string }>(`/api/analyses/${props.analysisId}/tests/${testId}/runs`, { method: "POST" });
    activeRunId.value = result.runId;
    refreshDeadline = Date.now() + 10 * 60 * 1000;
    feedbackError.value = false;
    feedback.value = "개별 테스트를 실행 대기열에 등록했습니다.";
    emit("changed");
    scheduleRefresh();
  } catch (cause) {
    feedbackError.value = true;
    feedback.value = errorMessage(cause, "개별 테스트 실행 요청에 실패했습니다.");
  } finally { busyId.value = ""; }
}
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (!activeRunId.value || Date.now() >= refreshDeadline) return;
  refreshTimer = setTimeout(() => {
    emit("changed");
    scheduleRefresh();
  }, 2500);
}
function stopRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = undefined;
  activeRunId.value = "";
}
watch(() => props.runs.map((run) => `${run.id}:${run.status}`).join("|"), () => {
  const active = props.runs.find((run) => run.id === activeRunId.value);
  if (active && !["pending", "running"].includes(active.status)) stopRefresh();
});
onBeforeUnmount(stopRefresh);
</script>

<template>
  <component :is="compact ? 'div' : 'section'" :class="compact ? 'detail-block' : 'section card report-section report-section--tests'">
    <div class="section-head">
      <div><h2 v-if="!compact">AI가 제안한 테스트</h2><h3 v-else>자동 생성 테스트</h3><p>시나리오를 수정하거나 안전한 테스트 한 건만 다시 실행할 수 있습니다.</p></div>
      <div class="scenario-actions"><span class="tag">{{ tests.length }}개</span><button v-if="reviewMode && editingId !== '__new'" type="button" class="scenario-button" @click="startAdd">새 시나리오 추가</button></div>
    </div>
    <div v-if="feedback" :class="feedbackError ? 'error-box' : 'notice'">{{ feedback }}</div>
    <p v-if="!tests.length && editingId !== '__new'" class="muted">생성된 테스트가 없습니다.</p>
    <div v-if="tests.length || editingId === '__new'" class="grid">
      <article v-if="editingId === '__new'" class="test-card"><form class="scenario-editor" @submit.prevent="save('__new')"><h3>사용자 시나리오 추가</h3><p class="muted">동작 뒤에 예상 결과 확인 단계를 1개 이상 추가해야 합니다.</p><label>제목<input v-model="drafts.__new!.title" required maxlength="160"></label><label>설명<textarea v-model="drafts.__new!.description" maxlength="500" rows="2" /></label><label>목적<textarea v-model="drafts.__new!.purpose" maxlength="500" rows="2" /></label><fieldset v-for="(step,index) in drafts.__new!.steps" :key="index" class="scenario-step" :class="{ 'scenario-step--assertion': isAssertion(step.action) }"><legend>{{ index+1 }}단계 · {{ isAssertion(step.action) ? '예상 결과' : '실행 동작' }}</legend><label>동작<select v-model="step.action" @change="onActionChanged(step)"><option v-for="action in actions" :key="action.value" :value="action.value">{{ action.label }}</option></select></label><label v-if="needsElement(step.action)">대상 요소<select v-model="step.elementId" required><option value="" disabled>요소를 선택하세요</option><option v-for="element in snapshot.elements" :key="element.id" :value="element.id">{{ elementLabel(element.id) }}</option></select></label><label>설명<input v-model="step.description" required maxlength="300"></label><label v-if="valueLabel(step.action)">{{ valueLabel(step.action) }}<input v-model="step.value" maxlength="500"></label><label v-if="['assert_url','assert_title','assert_text','assert_scroll','assert_attribute','assert_value','assert_count'].includes(step.action)">예상값<input v-model="step.expected" maxlength="500" :placeholder="step.action === 'assert_scroll' ? '#대상ID 또는 changed' : step.action === 'assert_count' ? '0 이상의 정수' : ''"></label><button type="button" class="scenario-button" :disabled="drafts.__new!.steps.length === 1" @click="removeStep('__new',index)">단계 삭제</button></fieldset><div class="scenario-actions"><button type="button" class="scenario-button" @click="addStep('__new')">단계 추가</button><span class="scenario-spacer"/><button type="button" class="scenario-button" @click="cancelEdit">취소</button><button type="submit" class="scenario-button scenario-button--primary" :disabled="busyId === '__new'">{{ busyId === '__new' ? '저장 중…' : '추가' }}</button></div></form></article>
      <article v-for="(test, testIndex) in tests" :key="test.id" class="test-card scenario-card">
        <template v-if="editingId !== test.id">
          <div class="test-card__head"><div class="scenario-card__identity"><span class="scenario-card__number">{{ String(testIndex + 1).padStart(2, '0') }}</span><div><h3>{{ test.title }}</h3><p class="muted">{{ test.purpose }}</p></div></div><span class="tag" :class="`tag--${test.safetyLevel}`">{{ uiLabel(test.safetyLevel) }}</span></div>
          <div class="test-meta"><span class="tag">{{ uiLabel(test.category) }}</span><span class="tag">신뢰도 {{ Math.round(test.confidence * 100) }}%</span><span class="tag">수정 {{ test.revision || 1 }}판</span><span class="tag">{{ test.autoExecutable ? '자동 실행 가능' : '실행 검토 필요' }}</span></div>
          <p v-if="test.safetyReasons.length" class="muted">안전성 근거: {{ test.safetyReasons.join(' ') }}</p>
          <div class="test-meta"><span v-for="id in test.sourceElementIds" :key="id" class="tag">{{ elementLabel(id) }}</span></div>
          <div v-if="test.requirementIds?.length" class="test-meta"><span v-for="id in test.requirementIds" :key="id" class="tag tag--review">요구사항 {{ id }}</span></div>
          <div class="scenario-flow">
            <section><h4>실행 단계</h4><ol class="steps scenario-steps"><li v-for="step in executionSteps(test)" :key="step.id"><strong>{{ actionLabel(step.action) }}</strong><span>{{ step.description }}</span></li></ol></section>
            <section class="scenario-expectations"><h4>예상 결과</h4><ol class="steps scenario-steps"><li v-for="step in expectedSteps(test)" :key="step.id"><strong>{{ actionLabel(step.action) }}</strong><span>{{ expectedLabel(step) }}</span></li></ol><p v-if="!expectedSteps(test).length" class="scenario-verification-warning">자동으로 판정할 예상 결과가 없어 실행 전 검토가 필요합니다.</p></section>
          </div>
          <div v-if="latestRun(test.id)" class="scenario-run"><span>최근 실행</span><span class="tag" :class="`tag--${latestRun(test.id)!.status}`">{{ uiLabel(latestRun(test.id)!.status) }}</span><span>시나리오 {{ latestRun(test.id)!.scenarioRevision || 1 }}판</span></div>
          <div class="scenario-actions"><button type="button" class="scenario-button" :disabled="Boolean(busyId) || runIsActive(test.id)" @click="startEdit(test)">시나리오 수정</button><button v-if="!reviewMode" type="button" class="scenario-button scenario-button--primary" :disabled="Boolean(busyId) || runIsActive(test.id) || test.safetyLevel !== 'safe' || !test.autoExecutable" @click="rerun(test.id)">{{ busyId === test.id ? '처리 중…' : runIsActive(test.id) ? '실행 중…' : '이 테스트만 다시 실행' }}</button></div>
        </template>
        <form v-else class="scenario-editor" @submit.prevent="save(test.id)">
          <label>제목<input v-model="drafts[test.id]!.title" required maxlength="160"></label>
          <label>설명<textarea v-model="drafts[test.id]!.description" maxlength="500" rows="2" /></label>
          <label>목적<textarea v-model="drafts[test.id]!.purpose" maxlength="500" rows="2" /></label>
          <p class="muted">동작 뒤에 예상 결과 확인 단계를 1개 이상 추가해야 합니다.</p>
          <fieldset v-for="(step, index) in drafts[test.id]!.steps" :key="index" class="scenario-step" :class="{ 'scenario-step--assertion': isAssertion(step.action) }">
            <legend>{{ index + 1 }}단계 · {{ isAssertion(step.action) ? '예상 결과' : '실행 동작' }}</legend>
            <label>동작<select v-model="step.action" @change="onActionChanged(step)"><option v-for="action in actions" :key="action.value" :value="action.value">{{ action.label }}</option></select></label>
            <label v-if="needsElement(step.action)">대상 요소<select v-model="step.elementId" required><option value="" disabled>요소를 선택하세요</option><option v-for="element in snapshot.elements" :key="element.id" :value="element.id">{{ elementLabel(element.id) }}</option></select></label>
            <label>설명<input v-model="step.description" required maxlength="300"></label>
            <label v-if="valueLabel(step.action)">{{ valueLabel(step.action) }}<input v-model="step.value" maxlength="500"></label>
            <label v-if="['assert_url','assert_title','assert_text','assert_scroll','assert_attribute','assert_value','assert_count'].includes(step.action)">예상값<input v-model="step.expected" maxlength="500" :placeholder="step.action === 'assert_scroll' ? '#대상ID 또는 changed' : step.action === 'assert_count' ? '0 이상의 정수' : ''"></label>
            <button type="button" class="scenario-button" :disabled="drafts[test.id]!.steps.length === 1" @click="removeStep(test.id, index)">단계 삭제</button>
          </fieldset>
          <div class="scenario-actions"><button type="button" class="scenario-button" @click="addStep(test.id)">단계 추가</button><span class="scenario-spacer"/><button type="button" class="scenario-button" :disabled="busyId === test.id" @click="cancelEdit">취소</button><button type="submit" class="scenario-button scenario-button--primary" :disabled="busyId === test.id">{{ busyId === test.id ? '저장 중…' : '저장' }}</button></div>
        </form>
      </article>
    </div>
  </component>
</template>
