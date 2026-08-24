<script setup lang="ts">
import type { AutomatedTestRun, GeneratedTestScenario } from "~/shared/types/analysis";
import { testRunStatusLabel, testRunStatusTone } from "~/utils/test-run-status";
import { splitTestRunHistory } from "~/shared/utils/test-run-history";
import { testStabilityLabel, testStabilitySummary, type TestStabilityStatus } from "~/shared/utils/test-stability";
import { uiLabel } from "~/utils/ui-label";
const props = defineProps<{ runs: AutomatedTestRun[]; tests: GeneratedTestScenario[] }>();
const stabilityFilter = ref<"all" | TestStabilityStatus>("all");
const filterOptions: Array<{ value: "all" | TestStabilityStatus; label: string }> = [
  { value: "all", label: "전체" }, { value: "flaky", label: "불안정" }, { value: "consistently_failing", label: "지속 실패" },
  { value: "environment_affected", label: "환경 영향" }, { value: "stable", label: "안정" }, { value: "insufficient_data", label: "데이터 부족" }
];
function stability(scenarioId: string) { return testStabilitySummary(scenarioId, props.runs); }
function stabilityTone(status: TestStabilityStatus) {
  return { stable: "success", flaky: "warning", consistently_failing: "failed", environment_affected: "warning", insufficient_data: "safe" }[status];
}
const groups = computed(() => {
  const { current, previous } = splitTestRunHistory(props.runs);
  return [
    { key: "current", title: "현재 판정", description: "시나리오별 가장 최근 실행 결과입니다.", runs: current },
    { key: "previous", title: "이전 실행 기록", description: "재실행 전 결과를 기록으로 보관합니다.", runs: previous }
  ].map((group) => ({ ...group, runs: stabilityFilter.value === "all" ? group.runs : group.runs.filter((run) => stability(run.scenarioId).status === stabilityFilter.value) }))
    .filter((group) => group.runs.length);
});
</script>
<template>
  <section class="section card report-section report-section--runs"><div class="section-head"><div><h2>실제로 실행한 테스트</h2><p>최신 판정을 먼저 보여주고 이전 실행 결과는 별도 이력으로 유지합니다.</p></div></div>
    <div class="stability-toolbar" aria-label="테스트 안정성 필터"><div><strong>실행 안정성</strong><span>최근 5회와 자동 재검증 결과를 기준으로 분류합니다.</span></div><div class="stability-filters"><button v-for="option in filterOptions" :key="option.value" type="button" class="scenario-button" :class="{ 'is-active': stabilityFilter === option.value }" :aria-pressed="stabilityFilter === option.value" @click="stabilityFilter = option.value">{{ option.label }}</button></div></div>
    <p v-if="!groups.length" class="muted stability-empty">선택한 안정성 상태에 해당하는 실행 기록이 없습니다.</p>
    <div v-for="group in groups" :key="group.key" class="run-group" :class="`run-group--${group.key}`">
      <div class="run-group__head"><div><h3>{{ group.title }}</h3><p>{{ group.description }}</p></div><span class="tag">{{ group.runs.length }}건</span></div>
      <div class="grid"><article v-for="(run, runIndex) in group.runs" :key="run.id" class="test-card result-card"><div class="test-card__head"><div class="scenario-card__identity"><span class="scenario-card__number">{{ String(runIndex + 1).padStart(2, '0') }}</span><div><h3>{{ tests.find(t => t.id === run.scenarioId)?.title || run.scenarioId }}</h3><p class="muted">총 {{ run.stepResults.length }}개 단계 · 시나리오 {{ run.scenarioRevision || 1 }}판</p></div></div><span class="tag" :class="`tag--${testRunStatusTone(run)}`">{{ testRunStatusLabel(run) }}</span></div><div class="result-stability"><span class="tag" :class="`tag--${stabilityTone(stability(run.scenarioId).status)}`">{{ testStabilityLabel(stability(run.scenarioId).status) }}</span><span>최근 {{ stability(run.scenarioId).executionCount }}회 · 관찰 성공률 {{ stability(run.scenarioId).successRate }}%</span><span v-if="stability(run.scenarioId).productDefectCount">제품 결함 {{ stability(run.scenarioId).productDefectCount }}회</span><span v-if="stability(run.scenarioId).environmentErrorCount">환경·자동화 오류 {{ stability(run.scenarioId).environmentErrorCount }}회</span><span v-if="stability(run.scenarioId).recoveredCount">재검증 회복 {{ stability(run.scenarioId).recoveredCount }}회</span></div><p v-if="run.revalidation" class="revalidation-note" :class="{ 'is-recovered': run.revalidation.recovered }">자동 재검증 {{ run.revalidation.recovered ? '후 정상 동작을 확인했습니다. 간헐적 실패 가능성이 있습니다.' : '에서도 동일 유형의 오류가 발생했습니다.' }}<template v-if="run.revalidation.originalMessage"> 최초 오류: {{ run.revalidation.originalMessage }}</template></p><p v-if="run.failureKind" class="muted">판정: {{ uiLabel(run.failureKind) }}</p><p v-if="run.error" class="result-card__error">{{ run.error.message }}</p><ol class="steps result-steps"><li v-for="step in run.stepResults" :key="step.stepId"><span class="tag" :class="`tag--${step.status}`">{{ uiLabel(step.status) }}</span><div><strong>{{ step.description }}</strong><dl v-if="step.expected || step.actual" class="step-verdict"><div v-if="step.expected"><dt>예상</dt><dd>{{ step.expected.replace(/^url(?:-prefix)?:/, '') }}</dd></div><div v-if="step.actual"><dt>실제</dt><dd>{{ step.actual }}</dd></div></dl><p v-if="step.failureKind" class="muted">{{ uiLabel(step.failureKind) }}</p><p v-if="step.errorMessage" class="muted">{{ step.errorMessage }}</p><img v-if="step.screenshotArtifactId" class="screenshot" style="margin-top:10px" :src="`/api/analyses/${run.analysisId}/artifacts/${step.screenshotArtifactId}`" alt="실패 단계 스크린샷"></div></li></ol></article></div>
    </div>
  </section>
</template>
