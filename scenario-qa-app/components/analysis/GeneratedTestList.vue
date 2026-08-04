<script setup lang="ts">
import type { GeneratedTestScenario, PageSnapshot } from "~/shared/types/analysis";
const props = defineProps<{ tests: GeneratedTestScenario[]; snapshot: PageSnapshot }>();
function evidence(id: string) { const element = props.snapshot.elements.find((item) => item.id === id); return element ? `${id} · ${element.accessibleName || element.text || element.type}` : id; }
</script>
<template>
  <section class="section"><div class="section-head"><div><h2>AI가 제안한 테스트</h2><p>안전성 판정과 실제 실행 가능 여부를 구분합니다.</p></div><span>{{ tests.length }}개</span></div>
    <div class="grid"><article v-for="test in tests" :key="test.id" class="test-card"><div class="test-card__head"><div><h3>{{ test.title }}</h3><p class="muted">{{ test.purpose }}</p></div><span class="tag" :class="`tag--${test.safetyLevel === 'safe' ? 'safe' : test.safetyLevel === 'review_required' ? 'review' : 'blocked'}`">{{ test.safetyLevel }}</span></div><div class="test-meta"><span class="tag">{{ test.category }}</span><span class="tag">신뢰도 {{ Math.round(test.confidence * 100) }}%</span><span class="tag">{{ test.autoExecutable ? '자동 실행 대상' : '실행하지 않음' }}</span></div><p v-if="test.safetyReasons.length" class="muted">안전성 근거: {{ test.safetyReasons.join(' ') }}</p><div class="test-meta"><span v-for="id in test.sourceElementIds" :key="id" class="tag">{{ evidence(id) }}</span></div><ol class="steps"><li v-for="step in test.steps" :key="step.id"><strong>{{ step.action }}</strong> · {{ step.description }}</li></ol></article></div>
  </section>
</template>
