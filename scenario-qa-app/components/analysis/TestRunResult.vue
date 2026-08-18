<script setup lang="ts">
import type { AutomatedTestRun, GeneratedTestScenario } from "~/shared/types/analysis";
import { splitTestRunHistory } from "~/shared/utils/test-run-history";
import { uiLabel } from "~/utils/ui-label";
const props = defineProps<{ runs: AutomatedTestRun[]; tests: GeneratedTestScenario[] }>();
const groups = computed(() => {
  const { current, previous } = splitTestRunHistory(props.runs);
  return [
    { key: "current", title: "현재 판정", description: "시나리오별 가장 최근 실행 결과입니다.", runs: current },
    { key: "previous", title: "이전 실행 기록", description: "재실행 전 결과를 기록으로 보관합니다.", runs: previous }
  ].filter((group) => group.runs.length);
});
</script>
<template>
  <section class="section card report-section report-section--runs"><div class="section-head"><div><h2>실제로 실행한 테스트</h2><p>최신 판정을 먼저 보여주고 이전 실행 결과는 별도 이력으로 유지합니다.</p></div></div>
    <div v-for="group in groups" :key="group.key" class="run-group" :class="`run-group--${group.key}`">
      <div class="run-group__head"><div><h3>{{ group.title }}</h3><p>{{ group.description }}</p></div><span class="tag">{{ group.runs.length }}건</span></div>
      <div class="grid"><article v-for="(run, runIndex) in group.runs" :key="run.id" class="test-card result-card"><div class="test-card__head"><div class="scenario-card__identity"><span class="scenario-card__number">{{ String(runIndex + 1).padStart(2, '0') }}</span><div><h3>{{ tests.find(t => t.id === run.scenarioId)?.title || run.scenarioId }}</h3><p class="muted">총 {{ run.stepResults.length }}개 단계 · 시나리오 {{ run.scenarioRevision || 1 }}판</p></div></div><span class="tag" :class="`tag--${run.status}`">{{ uiLabel(run.status) }}</span></div><p v-if="run.failureKind" class="muted">판정: {{ uiLabel(run.failureKind) }}</p><p v-if="run.error" class="result-card__error">{{ run.error.message }}</p><ol class="steps result-steps"><li v-for="step in run.stepResults" :key="step.stepId"><span class="tag" :class="`tag--${step.status}`">{{ uiLabel(step.status) }}</span><div><strong>{{ step.description }}</strong><p v-if="step.failureKind" class="muted">{{ uiLabel(step.failureKind) }}</p><p v-if="step.errorMessage" class="muted">{{ step.errorMessage }}</p><img v-if="step.screenshotArtifactId" class="screenshot" style="margin-top:10px" :src="`/api/analyses/${run.analysisId}/artifacts/${step.screenshotArtifactId}`" alt="실패 단계 스크린샷"></div></li></ol></article></div>
    </div>
  </section>
</template>
