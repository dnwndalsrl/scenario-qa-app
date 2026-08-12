<script setup lang="ts">
import type { AiPageAnalysis, PageSnapshot } from "~/shared/types/analysis";
const props = defineProps<{ pageAnalysis: AiPageAnalysis; snapshot: PageSnapshot }>();
function evidence(ids: string[]) { return ids.map((id) => props.snapshot.elements.find((element) => element.id === id)).filter(Boolean); }
</script>
<template>
  <section class="section card report-section report-section--functions"><div class="section-head"><div><h2>AI가 발견한 기능</h2><p>존재하는 요소 ID만 근거로 사용했습니다.</p></div></div>
    <div class="grid grid--3"><article v-for="fn in pageAnalysis.primaryFunctions" :key="fn.id" class="test-card"><div class="test-card__head"><h3>{{ fn.name }}</h3><span class="tag">{{ Math.round(fn.confidence * 100) }}%</span></div><p class="muted">{{ fn.description }}</p><div class="test-meta"><span v-for="el in evidence(fn.relatedElementIds)" :key="el!.id" class="tag">{{ el!.id }} · {{ el!.accessibleName || el!.text || el!.type }}</span></div></article></div>
  </section>
</template>
