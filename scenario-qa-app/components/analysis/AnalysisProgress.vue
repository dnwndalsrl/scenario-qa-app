<script setup lang="ts">
import type { SiteAnalysis } from "~/shared/types/analysis";
import { ANALYSIS_STAGES } from "~/shared/types/analysis";
const props = defineProps<{ analysis: SiteAnalysis }>();
const singlePageStatuses = new Set(["pending", "launching_browser", "loading_page", "collecting_page", "analyzing_page", "generating_tests", "running_tests", "completed"]);
const siteCrawlStatuses = new Set(["pending", "launching_browser", "loading_entry_page", "collecting_entry_page", "discovering_links", "crawling_pages", "analyzing_pages", "generating_tests", "deduplicating_tests", "running_tests", "building_report", "completed", "partially_completed"]);
const visibleStages = computed(() => ANALYSIS_STAGES.filter((stage) => (props.analysis.options.mode === "single_page" ? singlePageStatuses : siteCrawlStatuses).has(stage.status)));
</script>
<template>
  <section class="progress-card card report-section report-section--progress" aria-live="polite">
    <div class="progress-line"><strong>{{ analysis.currentMessage }}</strong><span>{{ analysis.progress }}%</span></div>
    <div class="progress-track" role="progressbar" aria-label="분석 진행률" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="analysis.progress">
      <span class="progress-bar" :class="{ 'is-failed': analysis.status === 'failed', 'is-success': ['completed','partially_completed'].includes(analysis.status) }" :style="{ width: analysis.progress + '%' }"></span>
    </div>
    <div class="stage-list">
      <span v-for="stage in visibleStages.slice(1)" :key="stage.status" class="stage" :class="{ 'is-done': ['completed','partially_completed'].includes(analysis.status) || stage.progress < analysis.progress }">{{ stage.message.replace('있습니다.', '') }}</span>
    </div>
    <div v-if="analysis.error" class="error-box"><strong>{{ analysis.error.code }}</strong><br>{{ analysis.error.message }}</div>
  </section>
</template>
