<script setup lang="ts">
import type { AutomatedTestRun, GeneratedTestScenario } from "~/shared/types/analysis";
import { uiLabel } from "~/utils/ui-label";
defineProps<{ runs: AutomatedTestRun[]; tests: GeneratedTestScenario[] }>();
</script>
<template>
  <section class="section"><div class="section-head"><div><h2>실제로 실행한 테스트</h2><p>차단된 테스트와 Playwright 실행 결과를 분리했습니다.</p></div></div>
    <div class="grid"><article v-for="run in runs" :key="run.id" class="test-card"><div class="test-card__head"><h3>{{ tests.find(t => t.id === run.scenarioId)?.title || run.scenarioId }}</h3><span class="tag" :class="`tag--${run.status}`">{{ uiLabel(run.status) }}</span></div><p v-if="run.error" class="muted">{{ run.error.message }}</p><ol class="steps"><li v-for="step in run.stepResults" :key="step.stepId"><span class="tag" :class="`tag--${step.status}`">{{ uiLabel(step.status) }}</span> {{ step.description }}<div v-if="step.errorMessage" class="muted">{{ step.errorMessage }}</div><img v-if="step.screenshotArtifactId" class="screenshot" style="margin-top:10px" :src="`/api/analyses/${run.analysisId}/artifacts/${step.screenshotArtifactId}`" alt="실패 단계 스크린샷"></li></ol></article></div>
  </section>
</template>
