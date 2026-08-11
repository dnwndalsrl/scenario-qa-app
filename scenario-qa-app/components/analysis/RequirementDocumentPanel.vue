<script setup lang="ts">
import type { RequirementDocumentAnalysis } from "~/shared/types/analysis";
import { uiLabel } from "~/utils/ui-label";
defineProps<{ document?: RequirementDocumentAnalysis }>();
</script>
<template>
  <section v-if="document" class="section">
    <div class="section-head"><div><h2>1단계 요구사항 분석</h2><p>{{ document.fileName }}</p></div><span class="tag" :class="`tag--${document.status === 'completed' ? 'success' : document.status === 'failed' ? 'failed' : 'warning'}`">{{ uiLabel(document.status) }}</span></div>
    <div class="card panel">
      <div v-if="document.qaSuitability" class="test-meta">
        <span class="tag">{{ uiLabel(document.documentType || 'unknown') }}</span>
        <span class="tag" :class="`tag--${document.qaSuitability}`">{{ uiLabel(document.qaSuitability) }}</span>
        <span v-if="document.confidence !== undefined" class="tag">신뢰도 {{ Math.round(document.confidence * 100) }}%</span>
      </div>
      <p v-if="document.summary">{{ document.summary }}</p>
      <div v-if="document.qaSuitability === 'unsuitable'" class="notice">테스트 가능한 요구사항을 충분히 찾지 못해 이 문서는 시나리오 근거로 사용하지 않고 기본 페이지 분석을 진행합니다.</div>
      <div v-if="document.missingInformation?.length" class="notice"><strong>사용자 확인이 필요한 정보</strong><ul><li v-for="item in document.missingInformation" :key="item">{{ item }}</li></ul></div>
      <div v-if="document.requirements.length" class="requirement-list"><article v-for="item in document.requirements" :key="item.id"><div><strong>{{ item.id }} · {{ item.title }}</strong><span class="tag" :class="`tag--${item.priority === 'high' ? 'failed' : item.priority === 'medium' ? 'warning' : 'safe'}`">{{ item.priority }}</span></div><p>{{ item.expectedBehavior }}</p><small>{{ item.sourceReference }}</small></article></div>
      <div v-if="document.error" class="error-box">{{ document.error.message }}</div>
    </div>
  </section>
</template>
