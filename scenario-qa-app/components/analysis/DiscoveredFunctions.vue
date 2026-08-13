<script setup lang="ts">
import type { AiPageAnalysis, DiscoveredElement, PageSnapshot } from "~/shared/types/analysis";
const props = defineProps<{ pageAnalysis: AiPageAnalysis; snapshot: PageSnapshot }>();
function evidence(ids: string[]) { return ids.map((id) => props.snapshot.elements.find((element) => element.id === id)).filter((element): element is DiscoveredElement => Boolean(element)); }
function evidenceName(element: DiscoveredElement) { return (element.accessibleName || element.text || element.type).replace(/\s+/g, " ").trim(); }
function visibleEvidence(ids: string[]) { return evidence(ids).slice(0, 4); }
function remainingEvidenceCount(ids: string[]) { return Math.max(0, evidence(ids).length - 4); }
</script>
<template>
  <section class="section card report-section report-section--functions"><div class="section-head"><div><h2>AI가 발견한 기능</h2><p>존재하는 요소 ID만 근거로 사용했습니다.</p></div></div>
    <div class="grid grid--3">
      <article v-for="fn in pageAnalysis.primaryFunctions" :key="fn.id" class="test-card function-card">
        <div class="test-card__head"><h3>{{ fn.name }}</h3><span class="function-confidence">신뢰도 {{ Math.round(fn.confidence * 100) }}%</span></div>
        <p class="muted">{{ fn.description }}</p>
        <div v-if="evidence(fn.relatedElementIds).length" class="function-evidence">
          <strong>근거 요소</strong>
          <ul>
            <li v-for="el in visibleEvidence(fn.relatedElementIds)" :key="el.id" :title="evidenceName(el)"><code>{{ el.id }}</code><span>{{ evidenceName(el) }}</span></li>
          </ul>
          <small v-if="remainingEvidenceCount(fn.relatedElementIds)">외 {{ remainingEvidenceCount(fn.relatedElementIds) }}개 요소</small>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.function-card { display:flex; min-width:0; flex-direction:column; padding:22px; }
.function-card h3 { min-width:0; margin:0; font-size:17px; line-height:1.45; }
.function-card>.muted { margin:12px 0 0; font-size:13px; line-height:1.65; }
.function-confidence { flex:0 0 auto; padding-top:2px; color:var(--muted); font-size:11px; font-weight:750; white-space:nowrap; }
.function-evidence { margin-top:auto; padding-top:18px; }
.function-evidence>strong { display:block; color:var(--muted); font-size:11px; letter-spacing:.02em; }
.function-evidence ul { overflow:hidden; margin:8px 0 0; padding:0; border:1px solid #e1e7ef; border-radius:11px; background:#fff; list-style:none; }
.function-evidence li { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:9px; min-height:34px; padding:7px 10px; border-bottom:1px solid #edf1f5; }
.function-evidence li:last-child { border-bottom:0; }
.function-evidence code { color:#64748b; font-family:inherit; font-size:10px; font-weight:800; white-space:nowrap; }
.function-evidence li span { overflow:hidden; color:var(--ink); font-size:11px; line-height:1.35; text-overflow:ellipsis; white-space:nowrap; }
.function-evidence>small { display:block; margin-top:7px; color:var(--muted); font-size:10px; text-align:right; }
</style>
