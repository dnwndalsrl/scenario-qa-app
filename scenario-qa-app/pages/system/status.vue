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
    <div class="section-head"><div><h1>시스템 상태</h1><p>웹 앱과 실행기 경계, 연결 설정을 확인합니다.</p></div><button class="secondary-button" @click="() => refresh()">상태 다시 확인</button></div>
    <div v-if="data" class="status-layout"><section class="status-table"><header><span>서비스</span><span>상태</span><span>역할</span></header><div v-for="(service, name) in data.services" :key="name"><strong>{{ name }}</strong><span class="tag" :class="service.configured && (service.reachable ?? true) ? 'tag--success' : 'tag--warning'">{{ service.configured && (service.reachable ?? true) ? '정상' : '설정 필요' }}</span><p>{{ service.role }}</p></div></section><aside><h2>운영 회귀 검증</h2><p>동적 헤더, 리디렉션과 지연 요소를 읽기 전용으로 확인합니다.</p><dl><div><dt>상태</dt><dd><span class="tag" :class="`tag--${regressionTone}`">{{ regressionLabel }}</span></dd></div><div v-if="data.productionRegression.runNumber"><dt>실행</dt><dd>#{{ data.productionRegression.runNumber }}</dd></div><div v-if="data.productionRegression.checkedAt"><dt>확인</dt><dd>{{ formatKoreanDateTime(data.productionRegression.checkedAt) }}</dd></div><div><dt>응답</dt><dd>{{ data.latencyMs }}ms</dd></div></dl><a v-if="data.productionRegression.url" :href="data.productionRegression.url" target="_blank" rel="noreferrer">실행 기록 보기 →</a></aside></div>
  </div>
</template>

<style scoped>
.status-layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:24px}.status-table{overflow:hidden;padding:0 12px;border-radius:var(--r-card);background:var(--surface)}.status-table header,.status-table>div{display:grid;grid-template-columns:180px 140px 1fr;align-items:center;gap:16px;min-height:52px;padding:0 16px}.status-table header{color:var(--text-3);font-size:var(--fs-meta);font-weight:var(--fw-medium)}.status-table>div{border-top:1px solid var(--border);background:var(--bg)}.status-table strong{font-family:var(--font-mono);font-size:var(--fs-small);font-weight:var(--fw-medium)}.status-table p{margin:0;color:var(--text-2);font-size:var(--fs-small)}aside{padding:24px;border-radius:var(--r-card);background:var(--surface)}aside h2{margin-bottom:6px}aside>p{color:var(--text-3)}aside dl{display:grid;gap:10px;margin:24px 0}aside dl div{display:grid;grid-template-columns:80px 1fr}aside dt{color:var(--text-3);font-size:var(--fs-small)}aside dd{margin:0;font-family:var(--font-mono);font-size:var(--fs-small)}aside>a{font-size:var(--fs-small);font-weight:var(--fw-medium)}
</style>
