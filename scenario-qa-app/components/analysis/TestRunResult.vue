<script setup lang="ts">
import type { AutomatedTestRun, GeneratedTestScenario } from "~/shared/types/analysis";
import { uiLabel } from "~/utils/ui-label";
defineProps<{ runs: AutomatedTestRun[]; tests: GeneratedTestScenario[] }>();
</script>
<template>
  <section class="section card report-section report-section--runs"><div class="section-head"><div><h2>실제로 실행한 테스트</h2><p>차단된 테스트와 Playwright 실행 결과를 분리했습니다.</p></div></div>
    <div class="grid"><article v-for="(run, runIndex) in runs" :key="run.id" class="test-card result-card"><div class="test-card__head"><div class="scenario-card__identity"><span class="scenario-card__number">{{ String(runIndex + 1).padStart(2, '0') }}</span><div><h3>{{ tests.find(t => t.id === run.scenarioId)?.title || run.scenarioId }}</h3><p class="muted">총 {{ run.stepResults.length }}개 단계 · 시나리오 {{ run.scenarioRevision || 1 }}판</p></div></div><span class="tag" :class="`tag--${run.status}`">{{ uiLabel(run.status) }}</span></div><p v-if="run.error" class="result-card__error">{{ run.error.message }}</p><ol class="steps result-steps"><li v-for="step in run.stepResults" :key="step.stepId"><span class="tag" :class="`tag--${step.status}`">{{ uiLabel(step.status) }}</span><div><strong>{{ step.description }}</strong><p v-if="step.errorMessage" class="muted">{{ step.errorMessage }}</p><img v-if="step.screenshotArtifactId" class="screenshot" style="margin-top:10px" :src="`/api/analyses/${run.analysisId}/artifacts/${step.screenshotArtifactId}`" alt="실패 단계 스크린샷"></div></li></ol></article></div>
  </section>
</template>
