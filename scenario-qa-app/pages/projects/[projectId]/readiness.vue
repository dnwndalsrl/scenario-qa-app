<script setup lang="ts">
definePageMeta({ middleware: "project-exists" });
const route = useRoute(); const projectId = computed(() => String(route.params.projectId));
const request = useApiRequest<ProductionReadinessReport>();
onMounted(() => void load());
async function load(): Promise<void> { await request.execute(() => apiFetch<ApiResponse<ProductionReadinessReport>>(`/api/projects/${projectId.value}/readiness`)); }
function rate(value: number): string { return `${value.toFixed(1)}%`; }
</script>
<template>
  <div class="readiness-page">
    <AppPageHeader title="실사용 준비도" description="저장된 실행 근거와 현재 운영 설정을 바탕으로 준비 상태를 판정합니다."><el-button type="primary" :loading="request.pending.value" @click="load">다시 점검</el-button></AppPageHeader>
    <nav class="project-tabs" aria-label="프로젝트 메뉴"><NuxtLink :to="`/projects/${projectId}`">시나리오</NuxtLink><NuxtLink :to="`/projects/${projectId}/dashboard`">대시보드</NuxtLink><NuxtLink :to="`/projects/${projectId}/readiness`">실사용 준비도</NuxtLink><NuxtLink :to="`/projects/${projectId}/test-suites`">스위트</NuxtLink><NuxtLink :to="`/projects/${projectId}/schedules`">예약 실행</NuxtLink></nav>
    <el-skeleton v-if="request.pending.value && !request.data.value" :rows="10" animated />
    <el-alert v-else-if="request.error.value" :title="request.error.value" type="error" show-icon />
    <template v-else-if="request.data.value">
      <section class="readiness-verdict" :class="`readiness-verdict--${request.data.value.status}`"><span>최종 판정</span><strong>{{ request.data.value.status }}</strong><small>{{ new Date(request.data.value.generatedAt).toLocaleString() }}</small></section>
      <section class="readiness-grid"><article v-for="check in request.data.value.checks" :key="check.key" class="readiness-check"><span class="readiness-status" :class="`readiness-status--${check.status}`">{{ check.status }}</span><h2>{{ check.title }}</h2><p>{{ check.description }}</p><ul v-if="check.evidence"><li v-for="evidence in check.evidence" :key="evidence">{{ evidence }}</li></ul></article></section>
      <section class="analytics-table-panel"><h2>반복 안정성</h2><div class="table-scroll"><table><thead><tr><th>시나리오</th><th>실행</th><th>성공</th><th>실패</th><th>오류</th><th>중단</th><th>안정성</th><th>간헐 실패</th></tr></thead><tbody><tr v-for="item in request.data.value.stabilityResults" :key="item.scenarioId"><td>{{ item.scenarioName }}</td><td>{{ item.executionCount }}</td><td>{{ item.successCount }}</td><td>{{ item.failedCount }}</td><td>{{ item.errorCount }}</td><td>{{ item.blockedCount }}</td><td>{{ rate(item.stabilityRate) }}</td><td>{{ item.intermittentFailureCount }}</td></tr></tbody></table></div></section>
      <section v-if="request.data.value.recommendations.length" class="readiness-recommendations"><h2>조치 권고</h2><ol><li v-for="item in request.data.value.recommendations" :key="item.title"><strong>{{ item.title }}</strong><p>{{ item.description }}</p></li></ol></section>
    </template>
  </div>
</template>
