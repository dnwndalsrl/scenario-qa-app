<script setup lang="ts">
const props = defineProps<{ label: string; value: string; comparison?: MetricComparison; tone?: "default" | "good" | "bad" }>();
const comparisonLabel = computed(() => {
  const item = props.comparison; if (!item || item.difference === null) return "직전 기간 비교 불가";
  const sign = item.difference > 0 ? "+" : "";
  return `직전 기간 대비 ${sign}${item.difference.toFixed(1)}${props.value.includes("%") ? "%p" : ""}`;
});
</script>
<template>
  <article class="analytics-metric-card" :class="`analytics-metric-card--${tone || 'default'}`">
    <span>{{ label }}</span><strong>{{ value }}</strong>
    <small :class="comparison?.direction">{{ comparisonLabel }}</small>
  </article>
</template>
