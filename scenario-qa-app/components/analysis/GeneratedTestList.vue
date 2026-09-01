<script setup lang="ts">
import type { AutomatedTestRun, GeneratedTestAction, GeneratedTestScenario, PageSnapshot } from "~/shared/types/analysis";
import { testRunStatusLabel, testRunStatusTone } from "~/utils/test-run-status";
import { testStabilityLabel, testStabilitySummary, type TestStabilityStatus } from "~/shared/utils/test-stability";
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
  canRunSuites?: boolean;
}>(), { runs: () => [], compact: false, reviewMode: false, canRunSuites: false });
const emit = defineEmits<{ changed: [] }>();
const { $api } = useNuxtApp();
const editingId = ref("");
const aiComposerId = ref("");
const busyId = ref("");
const drafts = ref<Record<string, EditorDraft>>({});
const aiInstructions = ref<Record<string, string>>({});
const aiSummaries = ref<Record<string, string>>({});
const aiDraftKinds = ref<Record<string, "instruction" | "failure_fix">>({});
const feedback = ref("");
const feedbackError = ref(false);
const downloading = ref(false);
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
function stability(testId: string) { return testStabilitySummary(testId, props.runs); }
function stabilityTone(status: TestStabilityStatus) {
  return { stable: "success", flaky: "warning", consistently_failing: "failed", environment_affected: "warning", insufficient_data: "safe" }[status];
}
function runIsActive(testId: string) { return ["pending", "running"].includes(latestRun(testId)?.status || ""); }
function runFailed(testId: string) { return ["failed", "error", "blocked"].includes(latestRun(testId)?.status || ""); }
function fixedAfterFailure(testId: string) {
  const related = props.runs.filter((run) => run.scenarioId === testId);
  const latest = related.at(-1);
  if (latest?.status !== "success") return false;
  return related.slice(0, -1).some((run) => ["failed", "error", "blocked"].includes(run.status) && (run.scenarioRevision || 1) < (latest.scenarioRevision || 1));
}
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
  delete aiSummaries.value[test.id];
  delete aiDraftKinds.value[test.id];
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
function openAiComposer(testId: string) {
  aiComposerId.value = aiComposerId.value === testId ? "" : testId;
  aiInstructions.value[testId] ||= "";
  feedback.value = "";
}
async function createAiDraft(testId: string) {
  const instruction = aiInstructions.value[testId]?.trim();
  if (!instruction) return;
  busyId.value = testId;
  feedback.value = "";
  try {
    const request = await $api<{ requestId: string; status: "pending" }>(`/api/analyses/${props.analysisId}/tests/${testId}/ai-draft`, { method: "POST", body: { instruction } });
    feedbackError.value = false;
    feedback.value = "AI가 수정안을 만들고 있습니다. 완료되면 검토 화면을 엽니다.";
    const result = await waitForAiDraft(testId, request.requestId);
    if (!result?.draft || !result.summary) throw new Error("AI 수정안 생성이 지연되고 있습니다. 잠시 후 다시 요청해 주세요.");
    drafts.value[testId] = result.draft;
    aiSummaries.value[testId] = result.summary;
    aiDraftKinds.value[testId] = "instruction";
    aiComposerId.value = "";
    editingId.value = testId;
    feedbackError.value = false;
    feedback.value = "AI 수정안을 만들었습니다. 내용을 검토한 뒤 저장해 주세요.";
  } catch (cause) {
    feedbackError.value = true;
    feedback.value = errorMessage(cause, "AI 수정안을 만들지 못했습니다.");
  } finally { busyId.value = ""; }
}
async function waitForAiDraft(testId: string, requestId: string) {
  let result: { status: "pending" | "completed"; draft?: EditorDraft; summary?: string } | undefined;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1500 : 3000));
    result = await $api<{ status: "pending" | "completed"; draft?: EditorDraft; summary?: string }>(`/api/analyses/${props.analysisId}/tests/${testId}/ai-draft/${requestId}`);
    if (result.status === "completed") break;
  }
  return result;
}
async function createFailureFixDraft(testId: string) {
  busyId.value = testId;
  feedback.value = "";
  try {
    const request = await $api<{ requestId: string; status: "pending" }>(`/api/analyses/${props.analysisId}/tests/${testId}/ai-fix-draft`, { method: "POST" });
    feedbackError.value = false;
    feedback.value = "AI가 실패 근거를 분석하고 수정안을 만들고 있습니다.";
    const result = await waitForAiDraft(testId, request.requestId);
    if (!result?.draft || !result.summary) throw new Error("실패 원인 수정안 생성이 지연되고 있습니다. 잠시 후 다시 요청해 주세요.");
    drafts.value[testId] = result.draft;
    aiSummaries.value[testId] = result.summary;
    aiDraftKinds.value[testId] = "failure_fix";
    editingId.value = testId;
    feedbackError.value = false;
    feedback.value = "실패 원인 수정안을 만들었습니다. 변경 전·후를 확인한 뒤 적용해 주세요.";
  } catch (cause) {
    feedbackError.value = true;
    feedback.value = errorMessage(cause, "실패 원인 수정안을 만들지 못했습니다.");
  } finally { busyId.value = ""; }
}
function startAdd() {
  drafts.value.__new = { title: "", description: "", purpose: "", steps: [{ action: "assert_visible", description: "대상 요소가 표시되는지 확인", elementId: defaultElementId() }] };
  editingId.value = "__new";
  feedback.value = "";
}
function cancelEdit() {
  if (editingId.value) {
    delete aiSummaries.value[editingId.value];
    delete aiDraftKinds.value[editingId.value];
  }
  editingId.value = "";
}
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
async function downloadWorkbook() {
  downloading.value = true;
  feedback.value = "";
  try {
    const blob = await $api<Blob>(`/api/analyses/${props.analysisId}/tests/export`, { responseType: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `probe-qa-test-scenarios-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
    feedbackError.value = false;
    feedback.value = "테스트 시나리오 엑셀 파일을 다운로드했습니다.";
  } catch (cause) {
    feedbackError.value = true;
    feedback.value = errorMessage(cause, "엑셀 파일 다운로드에 실패했습니다.");
  } finally { downloading.value = false; }
}
function scenarioChanges(testId: string) {
  const original = props.tests.find((test) => test.id === testId);
  const draft = drafts.value[testId];
  if (!original || !draft) return [];
  const changes: Array<{ label: string; before: string; after: string }> = [];
  if (original.title !== draft.title) changes.push({ label: "제목", before: original.title, after: draft.title });
  const length = Math.max(original.steps.length, draft.steps.length);
  for (let index = 0; index < length; index += 1) {
    const before = original.steps[index];
    const after = draft.steps[index];
    const beforeText = before ? `${actionLabel(before.action)} · ${before.description}${before.expected ? ` · ${before.expected}` : ""}` : "없음";
    const afterText = after ? `${actionLabel(after.action)} · ${after.description}${after.expected ? ` · ${after.expected}` : ""}` : "없음";
    if (beforeText !== afterText || before?.elementId !== after?.elementId || before?.value !== after?.value) changes.push({ label: `${index + 1}단계`, before: beforeText, after: afterText });
  }
  return changes;
}
async function save(testId: string, rerunAfter = false) {
  const draft = drafts.value[testId];
  if (!draft) return;
  busyId.value = testId;
  feedback.value = "";
  let saved = false;
  try {
    const target = testId === "__new" ? `/api/analyses/${props.analysisId}/tests` : `/api/analyses/${props.analysisId}/tests/${testId}`;
    const result = await $api<{ test?: GeneratedTestScenario }>(target, { method: testId === "__new" ? "POST" : "PUT", body: testId === "__new" ? { ...draft, pageId: props.snapshot.pageId || null } : draft });
    saved = true;
    delete aiSummaries.value[testId];
    delete aiDraftKinds.value[testId];
    editingId.value = "";
    feedbackError.value = false;
    feedback.value = "테스트 시나리오를 저장했습니다.";
    if (rerunAfter && result.test?.safetyLevel === "safe" && result.test.autoExecutable) {
      const run = await $api<{ runId: string; dispatchStatus?: string }>(`/api/analyses/${props.analysisId}/tests/${testId}/runs`, { method: "POST" });
      activeRunId.value = run.runId;
      refreshDeadline = Date.now() + 10 * 60 * 1000;
      feedback.value = run.dispatchStatus === "retrying" ? "수정안을 저장했고 실행 요청을 자동 재시도 중입니다." : "수정안을 저장하고 다시 실행했습니다.";
      scheduleRefresh();
    } else if (rerunAfter) feedback.value = "수정안은 저장했지만 안전 검토가 필요해 자동 실행하지 않았습니다.";
    emit("changed");
  } catch (cause) {
    feedbackError.value = true;
    feedback.value = saved ? `수정안은 저장했지만 재실행 요청에 실패했습니다. ${errorMessage(cause, "잠시 후 다시 실행해 주세요.")}` : errorMessage(cause, "테스트 시나리오 저장에 실패했습니다.");
  } finally { busyId.value = ""; }
}
async function rerun(testId: string) {
  busyId.value = testId;
  feedback.value = "";
  try {
    const result = await $api<{ runId: string; dispatchStatus?: string }>(`/api/analyses/${props.analysisId}/tests/${testId}/runs`, { method: "POST" });
    activeRunId.value = result.runId;
    refreshDeadline = Date.now() + 10 * 60 * 1000;
    feedbackError.value = false;
    feedback.value = result.dispatchStatus === "retrying"
      ? "실행 요청이 일시적으로 실패해 자동 재시도 대기열에 등록했습니다."
      : "개별 테스트를 실행 대기열에 등록했습니다.";
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
watch(() => props.runs.map((run) => `${run.id}:${run.status}:${run.dispatch?.status}`).join("|"), () => {
  const active = props.runs.find((run) => run.id === activeRunId.value);
  if (active && !["pending", "running"].includes(active.status)) stopRefresh();
});
onBeforeUnmount(stopRefresh);
</script>

<template>
  <component :is="compact ? 'div' : 'section'" :class="compact ? 'detail-block' : 'section card report-section report-section--tests'">
    <div class="section-head">
      <div><h2 v-if="!compact">AI가 제안한 테스트</h2><h3 v-else>자동 생성 테스트</h3><p>시나리오를 수정하거나 안전한 테스트 한 건만 다시 실행할 수 있습니다.</p></div>
      <div class="scenario-actions scenario-actions--head"><span class="tag">{{ tests.length }}개</span><button type="button" class="scenario-button scenario-button--download" :disabled="!tests.length || downloading" @click="downloadWorkbook">{{ downloading ? '엑셀 생성 중…' : '엑셀 다운로드' }}</button><button v-if="reviewMode && editingId !== '__new'" type="button" class="scenario-button" @click="startAdd">새 시나리오 추가</button></div>
    </div>
    <div v-if="feedback" :class="feedbackError ? 'error-box' : 'notice'">{{ feedback }}</div>
    <TestSuiteManager v-if="!compact" :analysis-id="analysisId" :tests="tests" :runs="runs" :can-run="canRunSuites" @changed="emit('changed')" />
    <p v-if="!tests.length && editingId !== '__new'" class="muted">생성된 테스트가 없습니다.</p>
    <div v-if="tests.length || editingId === '__new'" class="grid">
      <article v-if="editingId === '__new'" class="test-card"><form class="scenario-editor" @submit.prevent="save('__new')"><h3>사용자 시나리오 추가</h3><p class="muted">동작 뒤에 예상 결과 확인 단계를 1개 이상 추가해야 합니다.</p><label>제목<input v-model="drafts.__new!.title" required maxlength="160"></label><label>설명<textarea v-model="drafts.__new!.description" maxlength="500" rows="2" /></label><label>목적<textarea v-model="drafts.__new!.purpose" maxlength="500" rows="2" /></label><fieldset v-for="(step,index) in drafts.__new!.steps" :key="index" class="scenario-step" :class="{ 'scenario-step--assertion': isAssertion(step.action) }"><legend>{{ index+1 }}단계 · {{ isAssertion(step.action) ? '예상 결과' : '실행 동작' }}</legend><label>동작<select v-model="step.action" @change="onActionChanged(step)"><option v-for="action in actions" :key="action.value" :value="action.value">{{ action.label }}</option></select></label><label v-if="needsElement(step.action)">대상 요소<select v-model="step.elementId" required><option value="" disabled>요소를 선택하세요</option><option v-for="element in snapshot.elements" :key="element.id" :value="element.id">{{ elementLabel(element.id) }}</option></select></label><label>설명<input v-model="step.description" required maxlength="300"></label><label v-if="valueLabel(step.action)">{{ valueLabel(step.action) }}<input v-model="step.value" maxlength="500"></label><label v-if="['assert_url','assert_title','assert_text','assert_scroll','assert_attribute','assert_value','assert_count'].includes(step.action)">예상값<input v-model="step.expected" maxlength="500" :placeholder="step.action === 'assert_scroll' ? '#대상ID 또는 changed' : step.action === 'assert_count' ? '0 이상의 정수' : ''"></label><button type="button" class="scenario-button" :disabled="drafts.__new!.steps.length === 1" @click="removeStep('__new',index)">단계 삭제</button></fieldset><div class="scenario-actions"><button type="button" class="scenario-button" @click="addStep('__new')">단계 추가</button><span class="scenario-spacer"/><button type="button" class="scenario-button" @click="cancelEdit">취소</button><button type="submit" class="scenario-button scenario-button--primary" :disabled="busyId === '__new'">{{ busyId === '__new' ? '저장 중…' : '추가' }}</button></div></form></article>
      <article v-for="(test, testIndex) in tests" :id="`scenario-${test.id}`" :key="test.id" class="test-card scenario-card">
        <template v-if="editingId !== test.id">
          <div class="test-card__head"><div class="scenario-card__identity"><span class="scenario-card__number">{{ String(testIndex + 1).padStart(2, '0') }}</span><div><h3>{{ test.title }}</h3><p class="muted">{{ test.purpose }}</p></div></div><span class="tag" :class="`tag--${test.safetyLevel}`">{{ uiLabel(test.safetyLevel) }}</span></div>
          <div class="test-meta"><span class="tag">{{ uiLabel(test.category) }}</span><span class="tag">신뢰도 {{ Math.round(test.confidence * 100) }}%</span><span class="tag">수정 {{ test.revision || 1 }}판</span><span class="tag">{{ test.autoExecutable ? '자동 실행 가능' : '실행 검토 필요' }}</span></div>
          <p v-if="test.safetyReasons.length" class="muted">안전성 근거: {{ test.safetyReasons.join(' ') }}</p>
          <div class="test-meta"><span v-for="id in test.sourceElementIds" :key="id" class="tag">{{ elementLabel(id) }}</span></div>
          <div v-if="test.requirementIds?.length" class="test-meta"><span v-for="id in test.requirementIds" :key="id" class="tag tag--review">요구사항 {{ id }}</span></div>
          <details class="scenario-flow scenario-disclosure" :open="reviewMode || runFailed(test.id)">
            <summary>실행 단계와 예상 결과 보기</summary>
            <section><h4>실행 단계</h4><ol class="steps scenario-steps"><li v-for="step in executionSteps(test)" :key="step.id"><strong>{{ actionLabel(step.action) }}</strong><span>{{ step.description }}</span></li></ol></section>
            <section class="scenario-expectations"><h4>예상 결과</h4><ol class="steps scenario-steps"><li v-for="step in expectedSteps(test)" :key="step.id"><strong>{{ actionLabel(step.action) }}</strong><span>{{ expectedLabel(step) }}</span></li></ol><p v-if="!expectedSteps(test).length" class="scenario-verification-warning">자동으로 판정할 예상 결과가 없어 실행 전 검토가 필요합니다.</p></section>
          </details>
          <div v-if="latestRun(test.id)" class="scenario-run"><span>최근 실행</span><span class="tag" :class="`tag--${testRunStatusTone(latestRun(test.id)!)}`">{{ testRunStatusLabel(latestRun(test.id)!) }}</span><span v-if="fixedAfterFailure(test.id)" class="tag tag--success">수정 후 정상 확인</span><span class="tag" :class="`tag--${stabilityTone(stability(test.id).status)}`">{{ testStabilityLabel(stability(test.id).status) }}</span><span>최근 {{ stability(test.id).executionCount }}회 · 관찰 성공률 {{ stability(test.id).successRate }}%</span><span>시나리오 {{ latestRun(test.id)!.scenarioRevision || 1 }}판</span></div>
          <form v-if="aiComposerId === test.id" class="scenario-ai-editor" @submit.prevent="createAiDraft(test.id)">
            <label :for="`ai-instruction-${test.id}`">어떻게 수정할까요?</label>
            <textarea :id="`ai-instruction-${test.id}`" v-model="aiInstructions[test.id]" required minlength="3" maxlength="1000" rows="3" placeholder="예: 클릭 후 다른 페이지로 이동하는지 URL까지 확인하도록 바꿔줘." />
            <p>AI가 현재 시나리오와 수집된 페이지 요소를 바탕으로 초안을 만듭니다. 자동 저장되지 않습니다.</p>
            <div class="scenario-actions"><button type="button" class="scenario-button" :disabled="busyId === test.id" @click="aiComposerId = ''">취소</button><button type="submit" class="scenario-button scenario-button--primary" :disabled="busyId === test.id || (aiInstructions[test.id]?.trim().length || 0) < 3">{{ busyId === test.id ? '수정안 생성 중…' : 'AI 수정안 만들기' }}</button></div>
          </form>
          <div class="scenario-actions"><button v-if="runFailed(test.id)" type="button" class="scenario-button scenario-button--fix" :disabled="Boolean(busyId) || runIsActive(test.id)" @click="createFailureFixDraft(test.id)">{{ busyId === test.id ? '실패 근거 분석 중…' : '원인 분석·수정안 받기' }}</button><button v-if="!reviewMode" type="button" class="scenario-button scenario-button--primary" :disabled="Boolean(busyId) || runIsActive(test.id) || test.safetyLevel !== 'safe' || !test.autoExecutable" @click="rerun(test.id)">{{ busyId === test.id ? '처리 중…' : runIsActive(test.id) ? '실행 중…' : '이 테스트만 다시 실행' }}</button><details class="scenario-more"><summary class="scenario-button">수정 옵션</summary><div><button type="button" class="scenario-button" :disabled="Boolean(busyId) || runIsActive(test.id)" @click="openAiComposer(test.id)">AI로 수정 요청</button><button type="button" class="scenario-button" :disabled="Boolean(busyId) || runIsActive(test.id)" @click="startEdit(test)">직접 수정</button></div></details></div>
        </template>
        <form v-else class="scenario-editor" @submit.prevent="save(test.id)">
          <div v-if="aiSummaries[test.id]" class="scenario-ai-draft-notice"><strong>{{ aiDraftKinds[test.id] === 'failure_fix' ? '실패 근거로 만든 검토 전 수정안' : 'AI가 만든 검토 전 초안' }}</strong><span>{{ aiSummaries[test.id] }}</span><small>대상 요소와 예상 결과를 확인한 뒤 저장해 주세요. 취소하면 기존 시나리오는 유지됩니다.</small></div>
          <div v-if="aiDraftKinds[test.id] === 'failure_fix' && scenarioChanges(test.id).length" class="scenario-ai-diff"><strong>변경 전·후</strong><div v-for="change in scenarioChanges(test.id)" :key="change.label" class="scenario-ai-diff__row"><b>{{ change.label }}</b><span><em>전</em>{{ change.before }}</span><span><em>후</em>{{ change.after }}</span></div></div>
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
          <div class="scenario-actions"><button type="button" class="scenario-button" @click="addStep(test.id)">단계 추가</button><span class="scenario-spacer"/><button type="button" class="scenario-button" :disabled="busyId === test.id" @click="cancelEdit">취소</button><button v-if="aiDraftKinds[test.id] === 'failure_fix'" type="button" class="scenario-button scenario-button--primary" :disabled="busyId === test.id" @click="save(test.id, true)">{{ busyId === test.id ? '저장 중…' : '저장 후 재실행' }}</button><button type="submit" class="scenario-button" :class="{ 'scenario-button--primary': aiDraftKinds[test.id] !== 'failure_fix' }" :disabled="busyId === test.id">{{ busyId === test.id ? '저장 중…' : '저장' }}</button></div>
        </form>
      </article>
    </div>
  </component>
</template>
