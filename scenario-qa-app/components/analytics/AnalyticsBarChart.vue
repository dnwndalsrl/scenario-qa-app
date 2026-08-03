<script setup lang="ts">
interface Series { key: keyof AnalyticsTimeseriesPoint; label: string; color: string }
const props = defineProps<{ title: string; points: AnalyticsTimeseriesPoint[]; series: Series[]; formatter?: "count" | "rate" | "duration" }>();
const emit = defineEmits<{ select: [point: AnalyticsTimeseriesPoint] }>();
const maximum = computed(() => Math.max(1, ...props.points.flatMap((point) => props.series.map((series) => Number(point[series.key]) || 0))));
function display(value: unknown): string { if (value === null) return "—"; const number = Number(value); if (props.formatter === "rate") return `${(number * 100).toFixed(1)}%`; if (props.formatter === "duration") return `${Math.round(number).toLocaleString()}ms`; return number.toLocaleString(); }
</script>
<template>
  <section class="analytics-chart-panel">
    <div class="analytics-chart-heading"><h2>{{ title }}</h2><div class="analytics-legend"><span v-for="item in series" :key="item.key"><i :style="{ background: item.color }" />{{ item.label }}</span></div></div>
    <div v-if="points.length" class="analytics-bars" role="img" :aria-label="`${title} 막대 차트`">
      <button v-for="point in points" :key="point.startDate" type="button" class="analytics-bar-group" :title="point.label" @click="emit('select', point)">
        <span class="analytics-bar-stack"><i v-for="item in series" :key="item.key" :style="{ height: `${Math.max(2, (Number(point[item.key]) || 0) / maximum * 100)}%`, background: item.color }" /></span>
        <small>{{ point.label }}</small>
      </button>
    </div>
    <p v-else class="analytics-empty">선택 기간에 표시할 데이터가 없습니다.</p>
    <details v-if="points.length" class="analytics-data-table"><summary>차트 데이터 표로 보기</summary><div class="table-scroll"><table><thead><tr><th>구간</th><th v-for="item in series" :key="item.key">{{ item.label }}</th></tr></thead><tbody><tr v-for="point in points" :key="point.startDate"><td>{{ point.label }}</td><td v-for="item in series" :key="item.key">{{ display(point[item.key]) }}</td></tr></tbody></table></div></details>
  </section>
</template>
