<script setup lang="ts">
import type { RequirementDocumentAnalysis } from "~/shared/types/analysis";
import { uiLabel } from "~/utils/ui-label";
defineProps<{ document?: RequirementDocumentAnalysis }>();
</script>
<template><section v-if="document" class="section"><div class="section-head"><div><h2>1단계 요구사항 분석</h2><p>{{ document.fileName }}</p></div><span class="tag" :class="`tag--${document.status === 'completed' ? 'success' : document.status === 'failed' ? 'failed' : 'warning'}`">{{ uiLabel(document.status) }}</span></div><div class="card panel"><p v-if="document.summary">{{ document.summary }}</p><div v-if="document.requirements.length" class="requirement-list"><article v-for="item in document.requirements" :key="item.id"><div><strong>{{ item.id }} · {{ item.title }}</strong><span class="tag" :class="`tag--${item.priority === 'high' ? 'failed' : item.priority === 'medium' ? 'warning' : 'safe'}`">{{ item.priority }}</span></div><p>{{ item.expectedBehavior }}</p><small>{{ item.sourceReference }}</small></article></div><div v-if="document.error" class="error-box">{{ document.error.message }}</div></div></section></template>
