<script setup lang="ts">
import type { AutomatedTestRun, GeneratedTestScenario, TestRunReviewClassification } from "~/shared/types/analysis";
import { testRunStatusLabel, testRunStatusTone } from "~/utils/test-run-status";
import { splitTestRunHistory } from "~/shared/utils/test-run-history";
import { reviewedRunResolution } from "~/shared/utils/test-run-follow-up";
import { recommendTestRunReview } from "~/shared/utils/test-run-review-recommendation";
import { buildTestRunTimeline } from "~/shared/utils/test-run-timeline";
import { testStabilityLabel, testStabilitySummary, type TestStabilityStatus } from "~/shared/utils/test-stability";
import { uiLabel } from "~/utils/ui-label";

const props = withDefaults(defineProps<{ analysisId: string; runs: AutomatedTestRun[]; tests: GeneratedTestScenario[]; compact?: boolean }>(), { compact: false });
const emit = defineEmits<{ changed: [] }>();
const { $api } = useNuxtApp();
const stabilityFilter = ref<"all" | TestStabilityStatus>("all");
const resultFilter = ref<"review_pending" | "attention" | "all" | "success">("review_pending");
const reviewDrafts = ref<Record<string, { classification: TestRunReviewClassification; note: string }>>({});
const reviewBusyId = ref("");
const reviewFeedback = ref<Record<string, { error: boolean; text: string }>>({});
const filterOptions: Array<{ value: "all" | TestStabilityStatus; label: string }> = [
  { value: "all", label: "전체" }, { value: "flaky", label: "불안정" }, { value: "consistently_failing", label: "지속 실패" },
  { value: "environment_affected", label: "환경 영향" }, { value: "stable", label: "안정" }, { value: "insufficient_data", label: "데이터 부족" }
];
const reviewOptions: Array<{ value: TestRunReviewClassification; label: string }> = [
  { value: "actual_defect", label: "실제 결함" },
  { value: "scenario_error", label: "테스트 시나리오 오류" },
  { value: "element_recognition_error", label: "대상 요소 인식 오류" },
  { value: "environment_issue", label: "테스트 환경 문제" },
  { value: "requirement_change", label: "요구사항 변경" },
  { value: "pending_review", label: "확인 보류" }
];
const correctionClassifications = new Set<TestRunReviewClassification>(["scenario_error", "element_recognition_error", "environment_issue", "requirement_change"]);

function stability(scenarioId: string) { return testStabilitySummary(scenarioId, props.runs); }
function stabilityTone(status: TestStabilityStatus) {
  return { stable: "success", flaky: "warning", consistently_failing: "failed", environment_affected: "warning", insufficient_data: "safe" }[status];
}
function isReviewPending(run: AutomatedTestRun) { return canReview(run) && (!run.review || run.review.classification === "pending_review"); }
function matchesResult(run: AutomatedTestRun, groupKey: string) {
  if (resultFilter.value === "review_pending") return groupKey === "current" && isReviewPending(run);
  if (resultFilter.value === "all") return true;
  if (resultFilter.value === "success") return run.status === "success" && !run.failureKind;
  return run.status !== "success" || Boolean(run.failureKind);
}
function recommendation(run: AutomatedTestRun) { return recommendTestRunReview(run); }
function confidenceLabel(confidence: "high" | "medium" | "low") { return confidence === "high" ? "높은 신뢰" : confidence === "medium" ? "보통 신뢰" : "근거 확인 필요"; }
function applyRecommendation(run: AutomatedTestRun) {
  const draft = reviewDrafts.value[run.id];
  if (draft) draft.classification = recommendation(run).classification;
}
function canReview(run: AutomatedTestRun) { return ["failed", "error", "blocked"].includes(run.status); }
function needsCorrection(run: AutomatedTestRun) {
  return correctionClassifications.has(reviewDrafts.value[run.id]?.classification || run.review?.classification || "pending_review");
}
function correctionLabel(run: AutomatedTestRun) {
  const classification = reviewDrafts.value[run.id]?.classification || run.review?.classification;
  if (classification === "element_recognition_error") return "대상 요소 수정으로 이동";
  if (classification === "requirement_change") return "예상 결과 수정으로 이동";
  if (classification === "environment_issue") return "테스트 재실행으로 이동";
  return "시나리오 수정으로 이동";
}
function resolution(run: AutomatedTestRun) { return reviewedRunResolution(run, props.runs); }
function timeline(run: AutomatedTestRun) { return buildTestRunTimeline(run); }
function actionLabel(action: string) {
  return {
    goto: "페이지 이동", wait_for_stable: "안정화 대기", click: "클릭", fill: "입력", select: "선택",
    assert_visible: "표시 확인", assert_hidden: "숨김 확인", assert_enabled: "활성 확인", assert_url: "URL 확인",
    assert_title: "제목 확인", assert_text: "텍스트 확인", assert_scroll: "스크롤 확인", assert_attribute: "속성 확인",
    assert_value: "값 확인", assert_count: "개수 확인"
  }[action] || action;
}
function visualChangeLabel(step: AutomatedTestRun["stepResults"][number]) {
  const change = step.visualChange;
  if (!change) return "";
  const url = change.beforeUrl === change.afterUrl ? "URL 유지" : `URL 변경: ${change.beforeUrl} → ${change.afterUrl}`;
  const scroll = change.beforeScrollY === change.afterScrollY ? `스크롤 ${change.afterScrollY}px 유지` : `스크롤 ${change.beforeScrollY}px → ${change.afterScrollY}px`;
  return `기준 동작 ${change.sourceStepOrder}단계 · ${actionLabel(change.sourceAction)} · ${url} · ${scroll}`;
}
function errorMessage(cause: any, fallback: string) {
  return cause?.data?.statusMessage || cause?.data?.message || cause?.message || fallback;
}
async function saveReview(run: AutomatedTestRun) {
  const draft = reviewDrafts.value[run.id];
  if (!draft) return;
  reviewBusyId.value = run.id;
  delete reviewFeedback.value[run.id];
  try {
    const result = await $api<{ run: AutomatedTestRun }>(`/api/analyses/${props.analysisId}/runs/${run.id}/review`, { method: "PUT", body: draft });
    reviewFeedback.value[run.id] = { error: false, text: result.run.review?.defectId && draft.classification === "actual_defect" ? "사용자 판정을 저장하고 결함으로 자동 등록했습니다." : "사용자 판정을 저장했습니다." };
    emit("changed");
  } catch (cause) {
    reviewFeedback.value[run.id] = { error: true, text: errorMessage(cause, "사용자 판정을 저장하지 못했습니다.") };
  } finally {
    reviewBusyId.value = "";
  }
}

watch(() => props.runs, (runs) => {
  for (const run of runs) {
    if (!canReview(run) || reviewDrafts.value[run.id]) continue;
    reviewDrafts.value[run.id] = {
      classification: run.review?.classification || "pending_review",
      note: run.review?.note || ""
    };
  }
}, { immediate: true });

const currentRuns = computed(() => splitTestRunHistory(props.runs).current);
const attentionCount = computed(() => currentRuns.value.filter((run) => run.status !== "success" || Boolean(run.failureKind)).length);
const successCount = computed(() => currentRuns.value.filter((run) => run.status === "success" && !run.failureKind).length);
const reviewPendingCount = computed(() => currentRuns.value.filter(isReviewPending).length);
const reviewCompletedCount = computed(() => currentRuns.value.filter((run) => canReview(run) && Boolean(run.review) && run.review?.classification !== "pending_review").length);
const reviewTotalCount = computed(() => reviewPendingCount.value + reviewCompletedCount.value);
const reviewCompletionPercent = computed(() => reviewTotalCount.value ? Math.round((reviewCompletedCount.value / reviewTotalCount.value) * 100) : 100);
const groups = computed(() => {
  const { current, previous } = splitTestRunHistory(props.runs);
  return [
    { key: "current", title: "현재 판정", description: "시나리오별 가장 최근 실행 결과입니다.", runs: current },
    { key: "previous", title: "이전 실행 기록", description: "재실행 전 결과를 기록으로 보관합니다.", runs: previous }
  ].map((group) => ({ ...group, runs: group.runs.filter((run) => (stabilityFilter.value === "all" || stability(run.scenarioId).status === stabilityFilter.value) && matchesResult(run, group.key)) }))
    .filter((group) => group.runs.length);
});
</script>

<template>
  <section class="section card report-section report-section--runs" :class="{ 'report-section--runs-compact': compact }">
    <div class="section-head"><span v-if="compact" class="report-section__number">04</span><div><h2>실제로 실행한 테스트</h2><p>문제가 있거나 판정 확인이 필요한 최신 결과를 먼저 보여줍니다.</p></div><span v-if="compact" class="report-section__meta">검토 대기 {{ reviewPendingCount }} · 검토 완료 {{ reviewCompletedCount }} · 완료율 {{ reviewCompletionPercent }}%</span></div>
    <section v-if="!compact || reviewPendingCount || reviewCompletedCount" class="review-inbox-summary" aria-labelledby="review-inbox-title"><div><p class="eyebrow">결과 검토</p><h3 id="review-inbox-title">검토 대기함</h3><p>자동 추천은 참고용이며 사용자가 판정을 저장하기 전에는 결함이나 수정안으로 확정되지 않습니다.</p></div><div class="review-inbox-metrics"><span><small>검토 대기</small><strong>{{ reviewPendingCount }}</strong></span><span><small>검토 완료</small><strong>{{ reviewCompletedCount }}</strong></span><span><small>완료율</small><strong>{{ reviewCompletionPercent }}%</strong></span></div><progress v-if="!compact" :value="reviewCompletionPercent" max="100" :aria-label="`실패 결과 검토 완료율 ${reviewCompletionPercent}%`" /></section>
    <div class="result-priority" aria-label="실행 결과 우선 필터"><button type="button" class="scenario-button" :class="{ 'is-active': resultFilter === 'review_pending' }" @click="resultFilter = 'review_pending'">검토 대기 {{ reviewPendingCount }}</button><button type="button" class="scenario-button" :class="{ 'is-active': resultFilter === 'attention' }" @click="resultFilter = 'attention'">문제 결과 {{ attentionCount }}</button><button type="button" class="scenario-button" :class="{ 'is-active': resultFilter === 'all' }" @click="resultFilter = 'all'">전체 최신 {{ currentRuns.length }}</button><button type="button" class="scenario-button" :class="{ 'is-active': resultFilter === 'success' }" @click="resultFilter = 'success'">정상 {{ successCount }}</button></div>
    <details v-if="!compact || resultFilter !== 'review_pending' || reviewPendingCount" class="stability-toolbar"><summary><strong>실행 안정성으로 추가 필터</strong><span>{{ stabilityFilter === 'all' ? '전체 상태' : filterOptions.find(option => option.value === stabilityFilter)?.label }}</span></summary><div class="stability-filters"><button v-for="option in filterOptions" :key="option.value" class="scenario-button" type="button" :class="{ 'is-active': stabilityFilter === option.value }" :aria-pressed="stabilityFilter === option.value" @click="stabilityFilter = option.value">{{ option.label }}</button></div></details>
    <p v-if="!groups.some(group => group.key === 'current')" class="muted stability-empty">{{ compact && resultFilter === 'review_pending' && !reviewPendingCount ? `검토가 필요한 결과가 없습니다. 정상 결과 ${successCount}건은 전체 최신에서 확인할 수 있습니다.` : '선택한 조건에 해당하는 최신 결과가 없습니다. 전체 최신 결과를 선택하면 정상 결과도 확인할 수 있습니다.' }}</p>
    <component :is="group.key === 'previous' ? 'details' : 'div'" v-for="group in groups" :key="group.key" class="run-group" :class="`run-group--${group.key}`">
      <summary v-if="group.key === 'previous'" class="run-history-summary"><span><strong>{{ group.title }}</strong><small>{{ group.description }}</small></span><b>{{ group.runs.length }}건 보기</b></summary>
      <div v-else class="run-group__head"><div><h3>{{ group.title }}</h3><p>{{ group.description }}</p></div><span class="tag">{{ group.runs.length }}건</span></div>
      <div class="grid">
        <article v-for="(run, runIndex) in group.runs" :key="run.id" class="test-card result-card">
          <div class="test-card__head"><div class="scenario-card__identity"><span class="scenario-card__number">{{ String(runIndex + 1).padStart(2, '0') }}</span><div><h3>{{ tests.find(t => t.id === run.scenarioId)?.title || run.scenarioId }}</h3><p class="muted">총 {{ run.stepResults.length }}개 단계 · 시나리오 {{ run.scenarioRevision || 1 }}판</p></div></div><span class="tag" :class="`tag--${testRunStatusTone(run)}`">{{ testRunStatusLabel(run) }}</span></div>
          <div class="result-stability"><span class="tag" :class="`tag--${stabilityTone(stability(run.scenarioId).status)}`">{{ testStabilityLabel(stability(run.scenarioId).status) }}</span><span>최근 {{ stability(run.scenarioId).executionCount }}회 · 관찰 성공률 {{ stability(run.scenarioId).successRate }}%</span><span v-if="stability(run.scenarioId).productDefectCount">제품 결함 {{ stability(run.scenarioId).productDefectCount }}회</span><span v-if="stability(run.scenarioId).environmentErrorCount">환경·자동화 오류 {{ stability(run.scenarioId).environmentErrorCount }}회</span><span v-if="stability(run.scenarioId).recoveredCount">재검증 회복 {{ stability(run.scenarioId).recoveredCount }}회</span></div>
          <p v-if="run.revalidation" class="revalidation-note" :class="{ 'is-recovered': run.revalidation.recovered }">자동 재검증 {{ run.revalidation.recovered ? '후 정상 동작을 확인했습니다. 간헐적 실패 가능성이 있습니다.' : '에서도 동일 유형의 오류가 발생했습니다.' }}<template v-if="run.revalidation.originalMessage"> 최초 오류: {{ run.revalidation.originalMessage }}</template></p>
          <p v-if="run.failureKind" class="muted">자동 판정: {{ uiLabel(run.failureKind) }}</p>
          <p v-if="run.error" class="result-card__error">{{ run.error.message }}</p>
          <div v-if="group.key === 'current' && isReviewPending(run)" class="review-recommendation"><div><span>추천 판정 · {{ confidenceLabel(recommendation(run).confidence) }}</span><strong>{{ uiLabel(recommendation(run).classification) }}</strong></div><p>{{ recommendation(run).reason }}</p><small>다음 행동 · {{ recommendation(run).nextAction }}</small><button v-if="recommendation(run).classification !== 'pending_review'" type="button" class="scenario-button" @click="applyRecommendation(run)">추천 판정 적용</button></div>
          <form v-if="group.key === 'current' && canReview(run) && reviewDrafts[run.id]" class="run-review" @submit.prevent="saveReview(run)">
            <div><strong>사용자 확인</strong><span>자동 판정과 별도로 실제 원인을 기록합니다.</span></div>
            <label>판정<select v-model="reviewDrafts[run.id]!.classification"><option v-for="option in reviewOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <label>메모<textarea v-model="reviewDrafts[run.id]!.note" maxlength="1000" rows="2" placeholder="판정 근거나 수정할 내용을 입력하세요." /></label>
            <div class="scenario-actions"><button type="submit" class="scenario-button scenario-button--primary" :disabled="reviewBusyId === run.id">{{ reviewBusyId === run.id ? '저장 중…' : '판정 저장' }}</button><a v-if="needsCorrection(run)" class="scenario-button" :href="`#scenario-${run.scenarioId}`">{{ correctionLabel(run) }}</a><a v-if="run.review?.defectId" class="scenario-button" href="#report-defects">연결된 결함 보기</a></div>
            <p v-if="reviewFeedback[run.id]" :class="reviewFeedback[run.id]!.error ? 'error-box' : 'notice'">{{ reviewFeedback[run.id]!.text }}</p>
          </form>
          <div v-else-if="run.review" class="run-review-summary"><strong>사용자 확인 · {{ uiLabel(run.review.classification) }}</strong><p v-if="run.review.note">{{ run.review.note }}</p><p v-if="resolution(run)" class="run-review-resolution">수정 후 정상 확인 · 시나리오 {{ resolution(run)?.scenarioRevision || 1 }}판 재실행 성공</p><div class="scenario-actions"><a v-if="run.review.defectId" class="scenario-button" href="#report-defects">연결된 결함 보기</a><a v-if="correctionClassifications.has(run.review.classification)" class="scenario-button" :href="`#scenario-${run.scenarioId}`">{{ correctionLabel(run) }}</a></div></div>
          <section class="execution-journey" aria-label="단계별 테스트 실행 과정">
            <div class="execution-journey__head"><div><span>실행 타임라인</span><strong>{{ timeline(run).items.length }}개 단계의 실제 실행 흐름</strong></div><dl><div><dt>정상</dt><dd>{{ timeline(run).successCount }}</dd></div><div><dt>문제</dt><dd>{{ timeline(run).attentionCount }}</dd></div><div v-if="timeline(run).displayDuration"><dt>소요</dt><dd>{{ timeline(run).displayDuration }}</dd></div></dl></div>
            <p v-if="timeline(run).firstAttentionOrder" class="execution-journey__notice">{{ timeline(run).firstAttentionOrder }}단계에서 첫 문제가 확인되었습니다. 해당 단계를 펼쳐 예상 결과와 실제 결과를 비교해 보세요.</p>
            <ol class="execution-timeline">
              <li v-for="step in timeline(run).items" :key="step.stepId" :class="{ 'is-attention': step.needsAttention }">
                <span class="execution-timeline__marker" aria-hidden="true">{{ step.order }}</span>
                <details :open="step.needsAttention || timeline(run).items.length <= 3" class="execution-step">
                  <summary><div><span>{{ actionLabel(step.action) }}</span><strong>{{ step.description }}</strong><small><template v-if="step.displayDuration">{{ step.displayDuration }}</template><template v-if="step.displayDuration && step.currentUrl"> · </template><template v-if="step.currentUrl">{{ step.currentUrl }}</template></small></div><span class="tag" :class="`tag--${step.status}`">{{ uiLabel(step.status) }}</span></summary>
                  <div class="execution-step__body">
                    <dl class="execution-verdict"><div><dt>예상 결과</dt><dd>{{ step.displayExpected || '이 단계에는 별도 기대값이 없습니다.' }}</dd></div><div :class="{ 'is-attention': step.needsAttention }"><dt>실제 결과</dt><dd>{{ step.displayActual }}</dd></div></dl>
                    <p v-if="step.failureKind" class="execution-step__classification">자동 판정 · {{ uiLabel(step.failureKind) }}</p>
                    <p v-if="step.errorMessage && step.errorMessage !== step.displayActual" class="execution-step__error">{{ step.errorMessage }}</p>
                    <p v-if="step.visualChange" class="execution-visual-change">{{ visualChangeLabel(step) }}</p>
                    <div v-if="step.beforeScreenshotArtifactId || step.screenshotArtifactId" class="execution-evidence-comparison" :class="{ 'is-single': !step.beforeScreenshotArtifactId || !step.screenshotArtifactId }">
                      <figure v-if="step.beforeScreenshotArtifactId"><span>실행 전</span><img class="screenshot" :src="`/api/analyses/${run.analysisId}/artifacts/${step.beforeScreenshotArtifactId}`" :alt="`${step.order}단계 기준 동작 실행 전 화면`"><figcaption>{{ step.visualChange ? `${step.visualChange.sourceStepOrder}단계 ${actionLabel(step.visualChange.sourceAction)} 전` : '검증 실행 전' }}</figcaption></figure>
                      <figure v-if="step.screenshotArtifactId"><span>실행 후</span><img class="screenshot" :src="`/api/analyses/${run.analysisId}/artifacts/${step.screenshotArtifactId}`" :alt="`${step.order}단계 실패 시점 화면`"><figcaption>{{ step.order }}단계 실패 시점</figcaption></figure>
                    </div>
                  </div>
                </details>
              </li>
            </ol>
          </section>
        </article>
      </div>
    </component>
  </section>
</template>

<style scoped>
.report-section--runs-compact{padding:32px 0!important;border-top:1px solid var(--border)!important}.report-section--runs-compact .section-head{display:flex;align-items:flex-start;gap:16px;margin-bottom:16px;padding:0!important}.report-section--runs-compact .section-head>div{flex:1}.report-section--runs-compact .section-head h2{margin:0;font-size:var(--fs-h2);line-height:var(--lh-h2)}.report-section--runs-compact .section-head p{margin:4px 0 0;color:var(--text-3);font-size:var(--fs-small)}.report-section__number{padding-top:4px;color:var(--text-4);font-family:var(--font-mono);font-size:var(--fs-small)}.report-section__meta{align-self:flex-end;color:var(--text-3);font-size:var(--fs-small)}.report-section--runs-compact .result-priority{gap:4px;margin-bottom:16px}.report-section--runs-compact .result-priority button{min-height:28px;padding:4px 10px;border:0;border-radius:var(--r-pill);background:none;color:var(--text-3);font-size:var(--fs-small);font-weight:var(--fw-medium);box-shadow:none}.report-section--runs-compact .result-priority button.is-active{background:var(--surface-2);color:var(--ink)}.report-section--runs-compact .stability-empty{padding:28px 16px;border:1px dashed var(--border);border-radius:var(--r-card);color:var(--text-3);text-align:center;font-size:var(--fs-body)}.report-section--runs-compact .review-inbox-summary{border:1px solid var(--border);border-radius:var(--r-card);background:var(--surface)}.report-section--runs-compact .run-group__head{font-size:var(--fs-small)}
</style>
