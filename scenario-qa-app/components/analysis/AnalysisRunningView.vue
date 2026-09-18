<script setup lang="ts">
import type { PageSnapshot, SiteAnalysis, SiteAnalysisStatus } from "~/shared/types/analysis";

interface UsageSummary { dailyUsed: number; dailyLimit: number; active: number; concurrentLimit: number }
const props = defineProps<{ analysis: SiteAnalysis; snapshot?: PageSnapshot; usage?: UsageSummary | null; busy?: boolean }>();
const emit = defineEmits<{ cancel: [] }>();
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

const statusOrder: SiteAnalysisStatus[] = ["launching_browser", "loading_page", "collecting_page", "analyzing_page", "generating_tests", "running_tests", "building_report"];
const statusAliases: Partial<Record<SiteAnalysisStatus, SiteAnalysisStatus>> = {
  pending: "launching_browser",
  loading_entry_page: "loading_page",
  collecting_entry_page: "collecting_page",
  discovering_links: "collecting_page",
  crawling_pages: "collecting_page",
  analyzing_pages: "analyzing_page",
  deduplicating_tests: "generating_tests"
};
const currentStatus = computed(() => statusAliases[props.analysis.status] || props.analysis.status);
const currentIndex = computed(() => Math.max(0, statusOrder.indexOf(currentStatus.value)));
const startedAt = computed(() => Date.parse(props.analysis.startedAt || props.analysis.createdAt));
const elapsed = computed(() => {
  const seconds = Math.max(0, Math.floor((now.value - startedAt.value) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
});
const stageTitle = computed(() => props.analysis.processStage === "document_analysis" ? "1단계 · 선택 문서 분석" : props.analysis.processStage === "test_execution" ? "3단계 · 확정 시나리오 실행" : "2단계 · 페이지·시나리오 분석");
const steps = computed(() => [
  { key: "launching_browser", label: "브라우저 준비", meta: "" },
  { key: "loading_page", label: "페이지 접속", meta: props.snapshot?.httpStatus ? `HTTP ${props.snapshot.httpStatus}` : "" },
  { key: "collecting_page", label: "페이지 구조 수집", meta: props.snapshot ? `요소 ${props.snapshot.elements.length}개` : "" },
  { key: "analyzing_page", label: "AI 페이지 기능 분석", meta: "" },
  { key: "generating_tests", label: "페이지별 테스트 생성", meta: "" },
  { key: "running_tests", label: "안전한 테스트 순차 실행", meta: "확정 후" },
  { key: "building_report", label: "QA 보고서 생성", meta: "" }
]);
function stepState(key: string) {
  const index = statusOrder.indexOf(key as SiteAnalysisStatus);
  return index < currentIndex.value ? "done" : index === currentIndex.value ? "active" : "waiting";
}
</script>

<template>
  <section class="analysis-running">
    <h1>분석 중입니다</h1>
    <div class="analysis-running__workspace">
      <section class="qa-target-card">
        <div class="qa-target-card__url"><span>{{ analysis.normalizedUrl }}</span><NuxtLink to="/">URL 변경</NuxtLink></div>
        <div class="qa-target-card__meta"><div class="qa-mode-switch" role="tablist" aria-label="분석 유형"><button class="active" type="button" role="tab" aria-selected="true">기능 QA</button><button type="button" role="tab" aria-selected="false" disabled>UI 점검</button></div><div class="analysis-running__usage"><span v-if="usage">{{ usage.dailyUsed }}/{{ usage.dailyLimit }} 오늘 · {{ usage.active }}/{{ usage.concurrentLimit }} 실행 중</span><strong>실행 중</strong></div></div>
      </section>
      <section class="analysis-running__panel" aria-live="polite">
        <header><strong>{{ stageTitle }}</strong><span><b>{{ elapsed }}</b> 경과 · 보통 3분 이내</span></header>
        <div class="analysis-running__track"><span :style="{ width: `${analysis.progress}%` }"></span></div>
        <ol>
          <li v-for="step in steps" :key="step.key" :class="`is-${stepState(step.key)}`"><span class="analysis-running__state"><b>{{ stepState(step.key) === 'done' ? '✓' : stepState(step.key) === 'active' ? '◌' : '○' }}</b>{{ stepState(step.key) === 'done' ? '완료' : stepState(step.key) === 'active' ? '진행 중' : '대기' }}</span><span class="analysis-running__label">{{ step.label }}</span><span>{{ step.meta }}</span></li>
        </ol>
        <footer><span>2단계가 끝나면 시나리오를 검토하고 실행을 확정합니다. 이 화면을 떠나도 계속 진행됩니다.</span><button type="button" :disabled="busy" @click="emit('cancel')">취소</button></footer>
      </section>
    </div>
  </section>
</template>
