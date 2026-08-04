<script setup lang="ts">
import type { SiteAnalysis } from "~/shared/types/analysis";
import { ANALYSIS_STAGES } from "~/shared/types/analysis";
const props = defineProps<{ analysis: SiteAnalysis }>();
const currentIndex = computed(() => ANALYSIS_STAGES.findIndex((stage) => stage.status === props.analysis.status));
</script>
<template>
  <section class="progress-card card" aria-live="polite">
    <div class="progress-line"><strong>{{ analysis.currentMessage }}</strong><span>{{ analysis.progress }}%</span></div>
    <div class="progress-track" role="progressbar" aria-label="분석 진행률" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="analysis.progress">
      <span class="progress-bar" :class="{ 'is-failed': analysis.status === 'failed', 'is-success': ['completed','partially_completed'].includes(analysis.status) }" :style="{ width: `${analysis.progress}%` }"></span>
    </div>
    <div class="stage-list">
      <span v-for="(stage, index) in ANALYSIS_STAGES.slice(1)" :key="stage.status" class="stage" :class="{ 'is-done': ['completed','partially_completed'].includes(analysis.status) || index < currentIndex }">{{ stage.message.replace('있습니다.', '') }}</span>
    </div>
    <div v-if="analysis.error" class="error-box"><strong>{{ analysis.error.code }}</strong><br>{{ analysis.error.message }}</div>
  </section>
</template>
