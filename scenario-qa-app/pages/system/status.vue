<script setup lang="ts">
import { formatKoreanDateTime } from "~/utils/date-format";
interface WorkflowRunStatus {
  configured: boolean;
  reachable: boolean;
  status: string;
  conclusion?: string;
  runNumber?: number;
  url?: string;
  checkedAt?: string;
  commitSha?: string;
}
interface Status {
  ok: boolean;
  checkedAt: string;
  latencyMs: number;
  services: Record<string, { configured: boolean; reachable?: boolean; role: string }>;
  productionRegression: WorkflowRunStatus;
  limits: Record<string, number>;
}
const { $api } = useNuxtApp();
const { data, refresh } = await useFetch<Status>("/api/system/status", { $fetch: $api });
const regressionLabel = computed(() => {
  const run = data.value?.productionRegression;
  if (!run?.configured) return "설정 필요";
  if (!run.reachable) return "조회 지연";
  if (run.status !== "completed") return run.status === "in_progress" ? "검증 중" : run.status === "queued" ? "대기 중" : "실행 기록 없음";
  return run.conclusion === "success" ? "통과" : run.conclusion === "failure" ? "실패" : "확인 필요";
});
const regressionTone = computed(() => data.value?.productionRegression.conclusion === "success" ? "success" : data.value?.productionRegression.conclusion === "failure" ? "failed" : "warning");
</script>

<template>
  <div>
    <div class="section-head"><div><p class="eyebrow">Runtime boundary</p><h1 style="font-size:42px">시스템 상태</h1><p>웹 앱과 실행기 경계, 연결 설정을 확인합니다.</p></div><button class="primary-button" @click="() => refresh()">다시 확인</button></div>
    <div v-if="data" class="grid grid--3"><div v-for="(service, name) in data.services" :key="name" class="metric"><span>{{ name }}</span><strong>{{ service.configured && (service.reachable ?? true) ? '정상' : '설정 필요' }}</strong><p class="muted">{{ service.role }}</p></div></div>
    <section v-if="data" class="card regression-status" aria-labelledby="regression-title">
      <div><p class="eyebrow">Production regression</p><h2 id="regression-title">운영 회귀 검증</h2><p>Doctor.AG의 동적 헤더, 리디렉션, 지연 요소와 Top 스크롤을 읽기 전용으로 확인합니다.</p></div>
      <div class="regression-status__result"><span class="tag" :class="`tag--${regressionTone}`">{{ regressionLabel }}</span><strong v-if="data.productionRegression.runNumber">#{{ data.productionRegression.runNumber }}</strong><span v-if="data.productionRegression.checkedAt" class="muted">{{ formatKoreanDateTime(data.productionRegression.checkedAt) }}</span><a v-if="data.productionRegression.url" :href="data.productionRegression.url" target="_blank" rel="noreferrer">실행 기록 보기 →</a></div>
    </section>
    <div v-if="data" class="notice">Supabase 응답 {{ data.latencyMs }}ms · 작업당 최대 {{ data.limits.workflowTimeoutMinutes }}분 · 사용자당 하루 {{ data.limits.dailyPerUser }}회</div>
  </div>
</template>
