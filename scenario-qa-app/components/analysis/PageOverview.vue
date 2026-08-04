<script setup lang="ts">
import type { AiPageAnalysis, PageSnapshot } from "~/shared/types/analysis";
const props = defineProps<{ snapshot: PageSnapshot; pageAnalysis: AiPageAnalysis }>();
const screenshot = computed(() => props.snapshot.screenshotArtifactId ? `/api/analyses/${props.snapshot.analysisId}/artifacts/${props.snapshot.screenshotArtifactId}` : "");
</script>
<template>
  <section class="section">
    <div class="section-head"><div><h2>페이지 분석</h2><p>AI 판단과 실제 수집 근거를 함께 표시합니다.</p></div><span class="tag">신뢰도 {{ Math.round(pageAnalysis.confidence * 100) }}%</span></div>
    <div class="detail-grid">
      <div class="card panel">
        <img v-if="screenshot" class="screenshot" :src="screenshot" alt="분석 시점 페이지 스크린샷">
        <div v-else class="empty">저장된 스크린샷이 없습니다.</div>
      </div>
      <div class="card panel">
        <span class="tag">{{ pageAnalysis.pageType }}</span><h3 style="margin-top:14px">{{ snapshot.title || '제목 없음' }}</h3>
        <p class="muted">{{ pageAnalysis.pagePurpose }}</p>
        <dl><dt>최종 URL</dt><dd class="muted" style="overflow-wrap:anywhere">{{ snapshot.finalUrl }}</dd><dt>수집 시각</dt><dd class="muted">{{ new Date(snapshot.collectedAt).toLocaleString('ko-KR') }}</dd></dl>
        <h3>분석 한계</h3><ul class="steps"><li v-for="item in pageAnalysis.limitations" :key="item">{{ item }}</li></ul>
      </div>
    </div>
  </section>
</template>
