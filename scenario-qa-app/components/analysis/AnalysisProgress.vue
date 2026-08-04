<script setup lang="ts">
import type { SiteAnalysis } from "~/shared/types/analysis";
import { ANALYSIS_STAGES } from "~/shared/types/analysis";
const props = defineProps<{ analysis: SiteAnalysis }>();
const currentIndex = computed(() => ANALYSIS_STAGES.findIndex((stage) => stage.status === props.analysis.status));
</script>
<template>
  <section class="progress-card card" aria-live="polite">
    <div class="progress-line"><strong>{{ analysis.currentMessage }}</strong><span>{{ analysis.progress }}%</span></div>
    <el-progress :percentage="analysis.progress" :status="analysis.status === 'failed' ? 'exception' : ['completed','partially_completed'].includes(analysis.status) ? 'success' : undefined" :stroke-width="12" />
    <div class="stage-list">
      <span v-for="(stage, index) in ANALYSIS_STAGES.slice(1)" :key="stage.status" class="stage" :class="{ 'is-done': ['completed','partially_completed'].includes(analysis.status) || index < currentIndex }">{{ stage.message.replace('있습니다.', '') }}</span>
    </div>
    <div v-if="analysis.error" class="error-box"><strong>{{ analysis.error.code }}</strong><br>{{ analysis.error.message }}</div>
  </section>
</template>
