<script setup lang="ts">
import type { AnalysisProcessStage } from "~/shared/types/analysis";
const props = defineProps<{ stage?: AnalysisProcessStage; hasDocument: boolean }>();
const order: AnalysisProcessStage[] = ["document_analysis", "page_analysis", "scenario_review", "test_execution", "report_complete"];
function state(stage: AnalysisProcessStage) {
  if (props.stage === "document_failed" && stage === "document_analysis") return "failed";
  if (props.stage === "failed") return "failed";
  const current = order.indexOf(props.stage || "page_analysis");
  const target = order.indexOf(stage);
  if (!props.hasDocument && stage === "document_analysis") return "skipped";
  return target < current ? "done" : target === current ? "active" : "waiting";
}
</script>
<template><section class="section card report-section report-section--process" aria-label="QA 분석 단계"><div class="section-head"><div><h2>분석 진행 단계</h2><p>문서 분석부터 확정 시나리오 실행까지의 진행 상태입니다.</p></div></div><div class="process-steps"><div :class="['process-step',state('document_analysis')]"><strong>1단계</strong><span>요구사항 문서 분석</span><small>{{ hasDocument ? 'PDF 요구사항 구조화' : '문서 없음 · 건너뜀' }}</small></div><div :class="['process-step',state('page_analysis')]"><strong>2단계</strong><span>페이지·시나리오 분석</span><small>시나리오 수정·추가·확정</small></div><div :class="['process-step',state(stage === 'report_complete' ? 'report_complete' : 'test_execution')]"><strong>3단계</strong><span>확정 시나리오 실행</span><small>Playwright 결과 보고서</small></div></div></section></template>
