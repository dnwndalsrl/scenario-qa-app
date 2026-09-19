<script setup lang="ts">
import type { AnalysisDetail, GeneratedTestScenario } from "~/shared/types/analysis";
import { splitTestRunHistory } from "~/shared/utils/test-run-history";
import { testStabilityLabel, testStabilitySummary } from "~/shared/utils/test-stability";
import { testRunStatusLabel } from "~/utils/test-run-status";
import { formatKoreanDateTime } from "~/utils/date-format";
import { uiLabel } from "~/utils/ui-label";

const props = defineProps<{ detail: AnalysisDetail; busy?: boolean; pdfDownloading?: boolean; actionError?: string; realtimeWarning?: string }>();
const emit = defineEmits<{ retry: []; downloadPdf: []; changed: []; refresh: [] }>();
const { $api } = useNuxtApp();
const downloading = ref(false);
const downloadError = ref("");
const selectedScenarioId = ref("");
const modalRef = ref<HTMLDialogElement | null>(null);
const editorRef = ref<{ hasUnsavedChanges: () => boolean; isBusy: () => boolean } | null>(null);
const analysis = computed(() => props.detail.analysis);
const summary = computed(() => props.detail.analysis.summary);
const summaryPurpose = computed(() => {
  const value = summary.value as { pagePurpose?: string; sitePurpose?: string } | undefined;
  return value?.pagePurpose || value?.sitePurpose || "";
});
const snapshot = computed(() => props.detail.snapshot);
const pageAnalysis = computed(() => props.detail.pageAnalysis);
const currentRuns = computed(() => splitTestRunHistory(props.detail.testRuns).current);
const screenshot = computed(() => snapshot.value?.screenshotArtifactId
  ? `/api/analyses/${analysis.value.id}/artifacts/${snapshot.value.screenshotArtifactId}` : "");
function latestRun(testId: string) { return currentRuns.value.find((run) => run.scenarioId === testId); }
function targetId(test: GeneratedTestScenario) { return test.sourceElementIds[0] || "–"; }
async function openModal(testId: string) {
  selectedScenarioId.value = testId;
  await nextTick();
  modalRef.value?.showModal();
}
function closeModal() {
  if (editorRef.value?.isBusy()) return;
  if (editorRef.value?.hasUnsavedChanges() && !window.confirm("저장하지 않은 수정 내용을 버릴까요?")) return;
  modalRef.value?.close();
  selectedScenarioId.value = "";
}
function onModalCancel(event: Event) { event.preventDefault(); closeModal(); }
async function downloadWorkbook() {
  downloading.value = true;
  downloadError.value = "";
  try {
    const blob = await $api<Blob>(`/api/analyses/${analysis.value.id}/tests/export`, { responseType: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `probe-qa-test-scenarios-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (cause: any) {
    downloadError.value = cause?.data?.statusMessage || cause?.message || "시나리오 엑셀 파일을 다운로드하지 못했습니다.";
  } finally { downloading.value = false; }
}
</script>

<template>
  <div class="report-done">
    <NuxtLink class="report-done__back" to="/analyses">← 분석 이력</NuxtLink>
    <header class="report-done__head">
      <div><h1>분석 보고서</h1><div class="report-done__meta">
        <strong>{{ analysis.normalizedUrl }}</strong><i /><span>{{ formatKoreanDateTime(analysis.createdAt) }}</span><i />
        <b>✓ 완료</b><span>3단계 완료 · {{ summary ? uiLabel(summary.overallStatus) : '보고서 생성' }}</span>
      </div></div>
      <div class="report-done__actions"><button class="secondary-button" type="button" :disabled="pdfDownloading" @click="emit('downloadPdf')">{{ pdfDownloading ? 'PDF 생성 중…' : 'PDF 다운로드' }}</button><button class="primary-button" type="button" :disabled="busy" @click="emit('retry')">다시 분석</button></div>
    </header>
    <nav class="report-done__nav" aria-label="보고서 바로가기">
      <a href="#report-summary">결과 요약</a><a href="#report-comparison">이전 비교</a><a href="#report-page">페이지 분석</a><a href="#report-scenarios">테스트 시나리오</a><a href="#report-results">실행 결과</a><a href="#report-defects">결함</a><a href="#report-issues">발견 문제</a>
    </nav>
    <div v-if="actionError" class="error-box">{{ actionError }}</div>
    <div v-if="realtimeWarning" class="report-done__notice"><span>{{ realtimeWarning }}</span><button type="button" @click="emit('refresh')">상태 새로고침</button></div>

    <section v-if="summary" id="report-summary" class="report-done__summary">
      <p>{{ summaryPurpose }}</p>
      <div class="report-done__kpis">
        <div><span>발견 요소</span><strong>{{ snapshot?.elements.length ?? 0 }}</strong></div>
        <div><span>생성 / 실행 테스트</span><strong>{{ summary.generatedTestCount }} <em>/</em> {{ summary.executedTestCount }}</strong></div>
        <div><span>성공 / 제품 결함</span><strong>{{ summary.successCount }} <em>/</em> {{ summary.failedCount }}</strong></div>
        <div><span>판정 보류 / 실행 오류</span><strong>{{ summary.inconclusiveCount || 0 }} <em>/</em> {{ summary.errorCount }}</strong></div>
      </div>
      <div class="report-done__steps" aria-label="QA 분석 단계">
        <div><span>01</span><strong>요구사항 문서 분석</strong><small>{{ detail.documentAnalysis ? '✓ 완료' : '– 문서 없음 · 건너뜀' }}</small></div>
        <div><span>02</span><strong>페이지·시나리오 분석</strong><small>✓ 완료 · 시나리오 {{ detail.generatedTests.length }}건 생성</small></div>
        <div><span>03</span><strong>확정 시나리오 실행</strong><small>✓ 완료 · Playwright 실행 완료</small></div>
      </div>
    </section>

    <RegressionComparison id="report-comparison" :analysis-id="analysis.id" compact />

    <section v-if="snapshot && pageAnalysis" id="report-page" class="report-done__section">
      <header><span>02</span><div><h2>페이지 분석</h2><p>AI 판단과 실제 수집 근거를 한 화면에서 확인합니다.</p></div></header>
      <div class="report-done__page">
        <figure><img v-if="screenshot" :src="screenshot" alt="분석 시점 페이지 스크린샷"><div v-else class="report-done__empty">저장된 스크린샷이 없습니다.</div><figcaption>{{ snapshot.finalUrl }} · {{ formatKoreanDateTime(snapshot.collectedAt) }}</figcaption></figure>
        <div class="report-done__page-copy"><span>{{ uiLabel(pageAnalysis.pageType) }}</span><h3>{{ snapshot.title || '제목 없음' }}</h3><p>{{ pageAnalysis.pagePurpose }}</p><strong>AI가 발견한 기능 {{ pageAnalysis.primaryFunctions.length }}개 · 신뢰도 {{ Math.round(pageAnalysis.confidence * 100) }}%</strong><ul><li v-for="feature in pageAnalysis.primaryFunctions" :key="feature.id"><span :title="feature.name">{{ feature.name }}</span><b>{{ Math.round(feature.confidence * 100) }}%</b></li></ul><details v-if="pageAnalysis.limitations.length"><summary>분석 한계 {{ pageAnalysis.limitations.length }}건 · 근거 요소 보기 →</summary><ul><li v-for="item in pageAnalysis.limitations" :key="item">{{ item }}</li></ul></details></div>
      </div>
    </section>

    <section v-if="snapshot" id="report-scenarios" class="report-done__section">
      <header><span>03</span><div><h2>AI가 제안한 테스트</h2><p>시나리오를 수정하거나 안전한 테스트 한 건만 다시 실행할 수 있습니다.</p></div><div class="report-done__section-actions"><small>{{ detail.generatedTests.length }}개</small><button class="secondary-button" type="button" :disabled="downloading || !detail.generatedTests.length" @click="downloadWorkbook">{{ downloading ? '엑셀 생성 중…' : '엑셀 다운로드' }}</button></div></header>
      <div v-if="downloadError" class="error-box">{{ downloadError }}</div>
      <TestSuiteManager :analysis-id="analysis.id" :tests="detail.generatedTests" :runs="detail.testRuns" can-run @changed="emit('changed')" />
      <div v-if="detail.generatedTests.length" class="report-done__table report-done__scenarios">
        <div class="report-done__table-head"><span>#</span><span>시나리오</span><span>유형</span><span>안전성</span><span>신뢰도</span><span>최근 실행</span><span>안정성</span><span></span></div>
        <div v-for="(test, index) in detail.generatedTests" :key="test.id" :id="`scenario-${test.id}`" class="report-done__row">
          <span>{{ String(index + 1).padStart(2, '0') }}</span><span class="report-done__scenario-name"><strong :title="test.title">{{ test.title }}</strong><small>{{ targetId(test) }}</small></span><span>{{ uiLabel(test.category) }}</span><span>{{ test.safetyLevel === 'safe' ? '✓' : '◐' }} {{ uiLabel(test.safetyLevel) }}</span><span>{{ Math.round(test.confidence * 100) }}%</span><span>{{ latestRun(test.id) ? testRunStatusLabel(latestRun(test.id)!) : '– 미실행' }}</span><span>{{ testStabilityLabel(testStabilitySummary(test.id, detail.testRuns).status) }}</span><button type="button" :aria-label="`${test.title} 상세 보기`" @click="openModal(test.id)">상세 보기 →</button>
        </div>
      </div>
      <div v-else class="report-done__empty">생성된 테스트 시나리오가 없습니다.</div>
    </section>

    <TestRunResult id="report-results" :analysis-id="analysis.id" :runs="detail.testRuns" :tests="detail.generatedTests" compact @changed="emit('changed')" />
    <DefectManager id="report-defects" :analysis-id="analysis.id" :runs="detail.testRuns" :tests="detail.generatedTests" compact @changed="emit('changed')" />
    <IssueList v-if="snapshot && pageAnalysis" id="report-issues" :snapshot="snapshot" :page-analysis="pageAnalysis" compact section-number="06" />

    <details v-if="detail.documentAnalysis" class="report-done__requirements"><summary>요구사항 분석 및 커버리지 상세 보기 →</summary><RequirementDocumentPanel :document="detail.documentAnalysis" /><RequirementCoverage :analysis-id="analysis.id" :document="detail.documentAnalysis" :tests="detail.generatedTests" :runs="detail.testRuns" can-run @changed="emit('changed')" /></details>

    <dialog v-if="selectedScenarioId && snapshot" ref="modalRef" class="report-done__dialog" aria-labelledby="report-scenario-title" @cancel="onModalCancel">
      <header><div><h2 id="report-scenario-title">시나리오 상세 보기</h2><p>실행 단계와 예상 결과를 확인한 뒤 필요한 경우 수정할 수 있습니다.</p></div><button type="button" class="secondary-button" @click="closeModal">닫기</button></header>
      <GeneratedTestList ref="editorRef" :analysis-id="analysis.id" :tests="detail.generatedTests" :snapshot="snapshot" :runs="detail.testRuns" modal-mode complete-mode :focus-test-id="selectedScenarioId" @changed="emit('changed')" />
    </dialog>
  </div>
</template>

<style scoped>
.report-done{width:1200px;margin:0 auto;font-family:var(--font-sans);color:var(--ink)}.report-done__back{display:inline-block;margin-bottom:8px;color:var(--text-3);font-size:var(--fs-small)}.report-done__head{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--section-gap);margin-bottom:var(--section-gap)}.report-done h1{margin:0;font-size:var(--fs-h1);line-height:var(--lh-h1);font-weight:var(--fw-semibold)}.report-done__meta{display:flex;align-items:center;gap:12px;margin-top:6px;color:var(--text-3);font-size:var(--fs-small);white-space:nowrap}.report-done__meta strong{max-width:360px;overflow:hidden;color:var(--ink);font-family:var(--font-mono);font-weight:var(--fw-medium);text-overflow:ellipsis}.report-done__meta i{height:12px;border-left:1px solid var(--border)}.report-done__meta b{color:var(--ink);font-weight:var(--fw-medium)}.report-done__actions,.report-done__section-actions{display:flex;align-items:center;gap:8px}.report-done__actions button,.report-done__section-actions button{width:auto!important;min-height:var(--h-btn);border-radius:var(--r-pill);font-size:var(--fs-body)}.report-done__nav{display:flex;width:max-content;gap:4px;margin-bottom:var(--section-gap);padding:4px;border-radius:var(--r-pill);background:var(--surface-2)}.report-done__nav a{padding:5px 12px;border-radius:var(--r-pill);color:var(--text-3);font-size:var(--fs-small)}.report-done__nav a:first-child{border:1px solid var(--border);background:var(--bg);color:var(--ink)}.report-done__notice{display:flex;justify-content:space-between;padding:12px 14px;border:1px solid var(--border);border-radius:var(--r-field)}.report-done__notice button{border:0;background:none;cursor:pointer}.report-done__summary>p{max-width:880px;margin:0 0 16px;font-size:var(--fs-body);line-height:var(--lh-body)}.report-done__kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));overflow:hidden;border-radius:var(--r-card);background:var(--surface)}.report-done__kpis>div{display:flex;flex-direction:column;gap:4px;padding:20px 24px;border-left:1px solid var(--border)}.report-done__kpis>div:first-child{border-left:0}.report-done__kpis span{color:var(--text-3);font-size:var(--fs-small)}.report-done__kpis strong{font-family:var(--font-mono);font-size:var(--fs-kpi);line-height:var(--lh-kpi);font-weight:var(--fw-semibold);font-variant-numeric:tabular-nums}.report-done__kpis em{color:var(--text-4);font-style:normal}.report-done__steps{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--section-gap);padding:16px 0 24px}.report-done__steps>div{display:grid;grid-template-columns:24px 1fr;gap:4px 8px}.report-done__steps span{grid-row:1/3;color:var(--text-4);font-family:var(--font-mono);font-size:var(--fs-meta)}.report-done__steps strong{font-size:var(--fs-body);font-weight:var(--fw-medium)}.report-done__steps small{color:var(--text-3);font-size:var(--fs-small)}.report-done__section{padding:32px 0;border-top:1px solid var(--border);scroll-margin-top:70px}.report-done__section>header{display:flex;align-items:flex-start;gap:16px;margin-bottom:16px}.report-done__section>header>span{padding-top:4px;color:var(--text-4);font-family:var(--font-mono);font-size:var(--fs-small)}.report-done__section>header>div:nth-child(2){flex:1}.report-done__section h2{margin:0;font-size:var(--fs-h2);line-height:var(--lh-h2)}.report-done__section header p{margin:4px 0 0;color:var(--text-3);font-size:var(--fs-small)}.report-done__section-actions small{color:var(--text-3);font-size:var(--fs-small)}.report-done__page{display:grid;grid-template-columns:440px minmax(0,1fr);gap:32px}.report-done__page figure{margin:0}.report-done__page figure img,.report-done__page figure>.report-done__empty{display:block;width:100%;height:280px;object-fit:contain;border-radius:var(--r-card);background:var(--surface)}.report-done__page figcaption{margin-top:8px;overflow:hidden;color:var(--text-4);font-size:var(--fs-meta);text-overflow:ellipsis;white-space:nowrap}.report-done__page-copy>span{color:var(--text-3);font-size:var(--fs-small)}.report-done__page-copy h3{margin:2px 0 6px;font-size:var(--fs-h3)}.report-done__page-copy p{margin:0 0 16px;color:var(--text-2);font-size:var(--fs-body)}.report-done__page-copy>strong{font-size:var(--fs-small)}.report-done__page-copy ul{margin:8px 0 0;padding:0;list-style:none}.report-done__page-copy li{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);font-size:var(--fs-body)}.report-done__page-copy li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.report-done__page-copy li b{color:var(--text-3);font-family:var(--font-mono);font-size:var(--fs-small);font-weight:var(--fw-regular)}.report-done__page-copy details{margin-top:12px;color:var(--text-3);font-size:var(--fs-small)}.report-done__page-copy summary{cursor:pointer;list-style:none}.report-done__table{overflow:hidden;border-radius:var(--r-card);background:var(--surface)}.report-done__table-head,.report-done__row{display:grid;grid-template-columns:32px minmax(0,1fr) 64px 96px 64px 100px 136px 120px;align-items:center;gap:16px}.report-done__table-head{padding:10px 28px 8px;color:var(--text-3);font-size:var(--fs-meta)}.report-done__row{min-height:64px;margin:0 16px;padding:0 12px;border-bottom:1px solid var(--border);background:var(--bg);font-size:var(--fs-small)}.report-done__row:last-child{border-bottom:0}.report-done__row>span,.report-done__row button{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.report-done__row>span:first-child{color:var(--text-4);font-family:var(--font-mono)}.report-done__scenario-name{display:flex;min-width:0;flex-direction:column}.report-done__scenario-name strong{overflow:hidden;font-size:var(--fs-body);font-weight:var(--fw-medium);text-overflow:ellipsis}.report-done__scenario-name small{color:var(--text-4);font-family:var(--font-mono);font-size:var(--fs-meta)}.report-done__row button{padding:0;border:0;background:none;color:var(--ink);font:inherit;font-weight:var(--fw-medium);cursor:pointer}.report-done__empty{padding:28px 16px;border:1px dashed var(--border);border-radius:var(--r-card);color:var(--text-3);text-align:center}.report-done__requirements{padding:24px 0;border-top:1px solid var(--border)}.report-done__requirements summary{cursor:pointer;list-style:none;color:var(--text-3);font-size:var(--fs-small)}.report-done__dialog{width:var(--focus-w);max-width:calc(100vw - 64px);max-height:calc(100vh - 64px);padding:var(--card-pad);overflow:auto;border:1px solid var(--border);border-radius:var(--r-composer);background:var(--bg);color:var(--ink);font-family:var(--font-sans)}.report-done__dialog::backdrop{background:rgba(255,255,255,.6)}.report-done__dialog>header{display:flex;justify-content:space-between;gap:var(--section-gap);margin-bottom:var(--section-gap)}.report-done__dialog h2{margin:0;font-size:var(--fs-h2)}.report-done__dialog header p{margin:6px 0 0;color:var(--text-3);font-size:var(--fs-small)}.report-done__dialog :deep(.scenario-modal-content .grid){display:block}.report-done__dialog :deep(.scenario-modal-content .test-card){padding:0;border:0;background:var(--bg);box-shadow:none}.report-done__dialog :deep(.scenario-modal-content .scenario-card__number){display:none}.report-done__dialog :deep(.scenario-modal-content .test-meta){padding-left:0}.report-done__dialog :deep(.scenario-modal-content .scenario-flow){display:block;margin-left:0}.report-done__dialog :deep(.scenario-modal-content .scenario-actions){justify-content:flex-end}.report-done__dialog :deep(.scenario-modal-content .scenario-button--primary){border:1px solid var(--border);background:var(--bg);color:var(--ink);box-shadow:none}
</style>
<style scoped>
.report-done__section :deep(.suite-panel){margin-bottom:16px;padding:0;border:0;background:transparent;box-shadow:none}.report-done__section :deep(.suite-panel__head){display:flex;align-items:center;margin-bottom:12px}.report-done__section :deep(.suite-panel__head h3){margin:0;font-size:var(--fs-body)}.report-done__section :deep(.suite-panel__head p){color:var(--text-3);font-size:var(--fs-small)}.report-done__section :deep(.suite-panel__head button){border-color:var(--border);border-radius:var(--r-pill);background:var(--bg);color:var(--ink);font-size:var(--fs-small);font-weight:var(--fw-medium);box-shadow:none}.report-done__section :deep(.suite-item){padding:16px;border:1px solid var(--border);border-radius:var(--r-card);background:var(--bg);box-shadow:none}.report-done__section :deep(.suite-item__main){align-items:center}.report-done__section :deep(.suite-item__title strong){font-size:var(--fs-body);font-weight:var(--fw-semibold)}.report-done__section :deep(.suite-item__main .scenario-button--primary){border:1px solid var(--border);border-radius:var(--r-pill);background:var(--bg);color:var(--ink);font-size:var(--fs-small);font-weight:var(--fw-medium);box-shadow:none}.report-done__section :deep(.suite-summary){display:flex;align-items:center;gap:12px}.report-done__section :deep(.suite-summary__metrics){display:flex;gap:8px}.report-done__section :deep(.suite-summary__metrics div){display:flex;gap:3px;padding:0;border:0;background:none}.report-done__section :deep(.suite-summary__status){border:0;background:none;color:var(--ink)}.report-done__section :deep(.suite-summary__meta){color:var(--text-3)}.report-done__section :deep(.suite-panel__empty){padding:16px;border:1px dashed var(--border);border-radius:var(--r-card);color:var(--text-3);font-size:var(--fs-small)}
.report-done__dialog :deep(.scenario-modal-content .scenario-modal__edit){padding:0;border:0;background:none;color:var(--ink);font-family:var(--font-sans);font-size:var(--fs-small);font-weight:var(--fw-medium);cursor:pointer}.report-done__dialog :deep(.scenario-modal-content .scenario-card>.muted){margin-left:0;background:var(--surface);color:var(--text-2)}.report-done__dialog :deep(.scenario-modal-content .scenario-step){border-color:var(--border);border-radius:var(--r-card);background:var(--surface)}.report-done__dialog :deep(.scenario-modal-content .scenario-steps){border-color:var(--border);border-radius:var(--r-card);background:var(--surface)}
</style>
