<script setup lang="ts">
import type { AnalysisDetail, PageDetail, SiteAnalysisSummary } from "~/shared/types/analysis";
import { uiLabel } from "~/utils/ui-label";
const props = defineProps<{ detail: AnalysisDetail }>(); const selectedId = ref<string>();
const emit = defineEmits<{ changed: [] }>();
const selected = computed<PageDetail | undefined>(() => props.detail.pages.find((item) => item.page.id === selectedId.value) || props.detail.pages[0]);
watch(() => props.detail.pages.length, () => { if (!selectedId.value && props.detail.pages[0]) selectedId.value = props.detail.pages[0].page.id; }, { immediate: true });
const summary = computed(() => props.detail.analysis.summary as SiteAnalysisSummary | undefined);
const commonIssues = computed(() => {
  const pages = props.detail.pages; const titles = pages.map((item) => item.snapshot?.title).filter(Boolean) as string[]; const duplicateTitles = [...new Set(titles.filter((title, index) => titles.indexOf(title) !== index))];
  return [
    ...pages.filter((item) => !item.snapshot?.title && item.page.status !== 'skipped').map((item) => `빈 title: ${item.page.normalizedUrl}`),
    ...duplicateTitles.map((title) => `중복 title: ${title}`),
    ...pages.filter((item) => item.page.httpStatus && item.page.httpStatus >= 400).map((item) => `HTTP ${item.page.httpStatus}: ${item.page.normalizedUrl}`),
    ...pages.flatMap((item) => (item.snapshot?.elements || []).filter((element) => element.type === 'image' && !element.accessibleName).map(() => `이미지 alt 누락: ${item.page.normalizedUrl}`))
  ];
});
function resultCount(page: PageDetail, status: string) { return page.testRuns.filter((run) => run.status === status).length; }
</script>
<template><section class="section"><div class="section-head"><div><h2>사이트 구조</h2><p>복잡한 그래프 대신 depth와 연결 근거를 확인할 수 있는 목록으로 표시합니다.</p></div><span class="tag">링크 {{ detail.siteMap?.edges.length || 0 }}개</span></div>
  <div class="site-layout"><div class="card page-list"><button v-for="item in detail.pages" :key="item.page.id" type="button" :class="['page-row', { selected: selected?.page.id === item.page.id }]" :style="{ paddingLeft: `${18 + item.page.depth * 18}px` }" @click="selectedId = item.page.id"><span class="page-dot" :class="`tag--${item.page.status === 'analyzed' ? 'success' : item.page.status === 'failed' ? 'failed' : 'warning'}`"/><span><strong>{{ item.snapshot?.title || item.page.title || '제목 없음' }}</strong><small>depth {{ item.page.depth }} · {{ uiLabel(item.pageAnalysis?.pageType || item.page.status) }} · 테스트 {{ item.generatedTests.length }}</small><small>{{ item.page.finalUrl || item.page.normalizedUrl }}</small></span></button></div>
    <div v-if="selected" class="card page-detail"><div class="section-head"><div><h3>{{ selected.snapshot?.title || '페이지 상세' }}</h3><p>{{ selected.page.finalUrl || selected.page.normalizedUrl }}</p></div><span class="tag" :class="`tag--${selected.page.status === 'analyzed' ? 'success' : selected.page.status === 'failed' ? 'failed' : 'warning'}`">{{ uiLabel(selected.page.status) }}</span></div>
      <img v-if="selected.snapshot?.screenshotArtifactId" class="screenshot" :src="`/api/analyses/${detail.analysis.id}/artifacts/${selected.snapshot.screenshotArtifactId}`" :alt="`${selected.snapshot.title} screenshot`">
      <div class="mini-grid"><div><span>발견 요소</span><strong>{{ selected.snapshot?.elements.length || 0 }}</strong></div><div><span>발견 기능</span><strong>{{ selected.pageAnalysis?.primaryFunctions.length || 0 }}</strong></div><div><span>테스트</span><strong>{{ selected.generatedTests.length }}</strong></div><div><span>실패</span><strong>{{ resultCount(selected, 'failed') + resultCount(selected, 'error') }}</strong></div></div>
      <div v-if="selected.pageAnalysis?.primaryFunctions.length" class="detail-block"><h3>발견 기능</h3><ul><li v-for="feature in selected.pageAnalysis.primaryFunctions" :key="feature.id"><strong>{{ feature.name }}</strong> — {{ feature.description }}</li></ul></div>
      <GeneratedTestList v-if="selected.snapshot" compact :analysis-id="detail.analysis.id" :tests="selected.generatedTests" :snapshot="selected.snapshot" :runs="selected.testRuns" @changed="emit('changed')" />
      <div v-if="selected.snapshot?.consoleMessages.length || selected.snapshot?.networkIssues.length" class="detail-block"><h3>콘솔·네트워크 문제</h3><ul><li v-for="issue in selected.snapshot.consoleMessages" :key="issue.id">{{ issue.type }}: {{ issue.text }}</li><li v-for="issue in selected.snapshot.networkIssues" :key="issue.id">{{ issue.status || 'request failed' }}: {{ issue.url }}</li></ul></div>
      <div v-if="selected.pageAnalysis?.limitations.length" class="detail-block"><h3>분석 한계</h3><ul><li v-for="item in selected.pageAnalysis.limitations" :key="item">{{ item }}</li></ul></div>
    </div></div>
  <div class="section-head common-head"><div><h2>사이트 공통 문제</h2><p>페이지 간 title, 응답 상태, 접근성 기본 문제를 함께 확인합니다.</p></div><span class="tag" :class="commonIssues.length ? 'tag--warning' : 'tag--success'">{{ commonIssues.length }}</span></div><div v-if="commonIssues.length" class="card issue-list"><div v-for="issue in commonIssues" :key="issue" class="issue">{{ issue }}</div></div><div v-else class="empty">현재 수집 범위에서 사이트 공통 문제를 발견하지 못했습니다.</div>
  <div v-if="summary" class="crawl-note">발견 {{ summary.totalDiscoveredUrls }} · 방문 {{ summary.totalVisitedPages }} · 실패 {{ summary.failedPageCount }} · 제한 {{ detail.analysis.crawlState?.limitReasons.join(', ') || '없음' }}</div>
</section></template>
