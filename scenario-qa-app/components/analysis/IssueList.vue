<script setup lang="ts">
import type { AiPageAnalysis, PageSnapshot } from "~/shared/types/analysis";
defineProps<{ snapshot: PageSnapshot; pageAnalysis: AiPageAnalysis }>();
</script>
<template>
  <section class="section card report-section report-section--issues"><div class="section-head"><div><h2>발견 문제</h2><p>테스트 성공 여부와 별도로 수집한 기술 문제입니다.</p></div></div>
    <div v-if="!snapshot.consoleMessages.length && !snapshot.networkIssues.length && !pageAnalysis.risks.length" class="empty">수집된 문제가 없습니다.</div>
    <div v-else class="grid"><div v-for="risk in pageAnalysis.risks" :key="risk.id" class="issue"><strong>{{ risk.title }}</strong><p>{{ risk.description }}</p><small>심각도 {{ risk.severity }} · 근거 {{ risk.relatedElementIds.join(', ') || '페이지 전반' }}</small></div><div v-for="item in snapshot.consoleMessages" :key="item.id" class="issue"><strong>콘솔 {{ item.type }}</strong><p>{{ item.text }}</p></div><div v-for="item in snapshot.networkIssues" :key="item.id" class="issue"><strong>네트워크 {{ item.status || '실패' }}</strong><p>{{ item.method }} {{ item.url }}</p></div></div>
  </section>
</template>
