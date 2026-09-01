<script setup lang="ts">
import type { AiPageAnalysis, PageSnapshot } from "~/shared/types/analysis";
import { formatKoreanDateTime } from "~/utils/date-format";
import { uiLabel } from "~/utils/ui-label";
const props = defineProps<{ snapshot: PageSnapshot; pageAnalysis: AiPageAnalysis }>();
const screenshot = computed(() => props.snapshot.screenshotArtifactId ? `/api/analyses/${props.snapshot.analysisId}/artifacts/${props.snapshot.screenshotArtifactId}` : "");
</script>
<template>
  <section class="section card page-overview">
    <div class="page-overview__head">
      <div><span class="page-overview__eyebrow">PAGE INSIGHT</span><h2>페이지 분석</h2><p>AI 판단과 실제 수집 근거를 한 화면에서 확인합니다.</p></div>
      <span class="page-overview__confidence">신뢰도 <strong>{{ Math.round(pageAnalysis.confidence * 100) }}%</strong></span>
    </div>
    <div class="page-overview__body">
      <div class="page-overview__visual">
        <span class="page-overview__label">수집 화면</span>
        <img v-if="screenshot" class="screenshot" :src="screenshot" alt="분석 시점 페이지 스크린샷">
        <div v-else class="empty">저장된 스크린샷이 없습니다.</div>
      </div>
      <div class="page-overview__content">
        <div class="page-overview__title"><span class="tag">{{ uiLabel(pageAnalysis.pageType) }}</span><h3>{{ snapshot.title || '제목 없음' }}</h3><p>{{ pageAnalysis.pagePurpose }}</p></div>
        <dl class="page-overview__meta"><div><dt>최종 URL</dt><dd>{{ snapshot.finalUrl }}</dd></div><div><dt>수집 시각</dt><dd>{{ formatKoreanDateTime(snapshot.collectedAt) }}</dd></div></dl>
        <div class="page-overview__limitations"><h3>분석 한계</h3><ul><li v-for="item in pageAnalysis.limitations" :key="item">{{ item }}</li></ul></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page-overview { overflow:hidden; padding:0; border-color:#ccd8e7; box-shadow:0 20px 52px rgba(32,49,79,.09); }
.page-overview__head { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:26px 30px; border-bottom:1px solid var(--line); background:linear-gradient(115deg,#f8f9ff 0%,#fff 62%,#f3f8ff 100%); }
.page-overview__head h2 { margin-top:6px; }
.page-overview__head p { margin:7px 0 0; color:var(--muted); }
.page-overview__eyebrow { color:var(--brand); font-size:11px; font-weight:850; letter-spacing:.12em; }
.page-overview__confidence { flex:none; padding:9px 12px; border:1px solid #d8dcff; border-radius:999px; background:#fff; color:var(--muted); font-size:12px; }
.page-overview__confidence strong { margin-left:3px; color:var(--brand-dark); }
.page-overview__body { display:grid; grid-template-columns:minmax(360px,.9fr) minmax(0,1.1fr); min-height:480px; }
.page-overview__visual { position:relative; display:grid; place-items:center; padding:22px; border-right:1px solid var(--line); background:#eef2f7; }
.page-overview__label { position:absolute; z-index:1; top:34px; left:34px; padding:6px 9px; border-radius:8px; background:rgba(15,32,57,.78); color:#fff; font-size:11px; font-weight:750; backdrop-filter:blur(6px); }
.page-overview__visual .screenshot { height:100%; max-height:600px; border-color:#d6deea; background:#fff; box-shadow:0 12px 28px rgba(32,49,79,.08); }
.page-overview__visual .empty { width:100%; }
.page-overview__content { display:flex; flex-direction:column; padding:34px; background:#fff; }
.page-overview__title h3 { margin:16px 0 8px; font-size:21px; letter-spacing:-.02em; }
.page-overview__title p { margin:0; color:var(--muted); line-height:1.7; }
.page-overview__meta { display:grid; gap:0; margin:26px 0 0; border:1px solid var(--line); border-radius:14px; background:#f8fafc; }
.page-overview__meta div { display:grid; grid-template-columns:88px minmax(0,1fr); gap:14px; padding:14px 16px; }
.page-overview__meta div+div { border-top:1px solid var(--line); }
.page-overview__meta dt { color:var(--ink); font-size:12px; font-weight:800; }
.page-overview__meta dd { margin:0; overflow-wrap:anywhere; color:var(--muted); font-size:13px; }
.page-overview__limitations { margin-top:26px; padding-top:24px; border-top:1px solid var(--line); }
.page-overview__limitations h3 { margin:0 0 12px; font-size:15px; }
.page-overview__limitations ul { display:grid; gap:8px; margin:0; padding-left:18px; color:var(--muted); font-size:13px; line-height:1.6; }
@media (max-width:800px) { .page-overview__body { grid-template-columns:1fr; }.page-overview__visual { min-height:360px; border-right:0; border-bottom:1px solid var(--line); } }
@media (max-width:520px) { .page-overview__head { align-items:flex-start; flex-direction:column; padding:22px; }.page-overview__content { padding:24px 20px; }.page-overview__visual { min-height:280px; padding:16px; }.page-overview__label { top:26px; left:26px; }.page-overview__meta div { grid-template-columns:1fr; gap:5px; } }
</style>
