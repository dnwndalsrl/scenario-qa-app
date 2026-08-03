<script setup lang="ts">
import type { AiConversionSummary } from "../../shared/types/ai-scenario";

defineProps<{
  summary: AiConversionSummary;
}>();
</script>

<template>
  <section class="ai-summary" aria-label="AI 변환 요약">
    <div>
      <strong>{{ summary.convertedStepCount }}</strong>
      <span>변환된 단계</span>
    </div>
    <div class="ai-summary--review">
      <strong>{{ summary.reviewRequiredCount }}</strong>
      <span>검토 필요</span>
    </div>
    <div class="ai-summary--missing">
      <strong>{{ summary.missingInformationCount }}</strong>
      <span>정보 누락</span>
    </div>
    <div class="ai-summary--unsupported">
      <strong>{{ summary.unsupportedCount }}</strong>
      <span>지원하지 않음</span>
    </div>
    <div>
      <strong>{{ Math.round(summary.averageConfidence * 100) }}%</strong>
      <span>평균 신뢰도</span>
    </div>
  </section>
</template>
