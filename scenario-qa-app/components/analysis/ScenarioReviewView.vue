<script setup lang="ts">
import type { AnalysisDetail, AutomatedTestRun, GeneratedTestScenario } from "~/shared/types/analysis";
import type { AnalysisPreflight, PreflightStatus } from "~/shared/types/preflight";
import { isScenarioIncluded, isScenarioReviewEligible } from "~/shared/utils/scenario-review";
import { testStabilityLabel, testStabilitySummary } from "~/shared/utils/test-stability";
import { formatKoreanDateTime } from "~/utils/date-format";
import { testRunStatusLabel } from "~/utils/test-run-status";
import { uiLabel } from "~/utils/ui-label";

const props = defineProps<{
  detail: AnalysisDetail;
  preflight?: AnalysisPreflight;
  preflightLoading?: boolean;
  preflightError?: string;
  actionError?: string;
  realtimeWarning?: string;
  busy?: boolean;
}>();
const emit = defineEmits<{ run: []; check: []; changed: []; refresh: [] }>();
const { $api } = useNuxtApp();
const selectionBusyId = ref("");
const selectionError = ref("");
const downloading = ref(false);
const advancedOpen = ref(false);
const advancedTarget = ref("");

const analysis = computed(() => props.detail.analysis);
const snapshot = computed(() => props.detail.snapshot);
const pageAnalysis = computed(() => props.detail.pageAnalysis);
const selectedCount = computed(() => props.detail.generatedTests.filter(isScenarioReviewEligible).length);
const estimatedMinutes = computed(() => Math.max(1, Math.ceil(selectedCount.value / 6)));
const screenshot = computed(() => snapshot.value?.screenshotArtifactId
  ? `/api/analyses/${analysis.value.id}/artifacts/${snapshot.value.screenshotArtifactId}`
  : "");

function preflightLabel(status: PreflightStatus) {
  return status === "ready" ? "통과" : status === "warning" ? "주의" : "차단";
}
function preflightGlyph(status: PreflightStatus) {
  return status === "ready" ? "✓" : status === "warning" ? "◐" : "✕";
}
function selectable(test: GeneratedTestScenario) {
  return test.safetyLevel === "safe" && test.autoExecutable && test.steps.some((step) => step.action.startsWith("assert_"));
}
function latestRun(testId: string): AutomatedTestRun | undefined {
  return [...props.detail.testRuns].reverse().find((run) => run.scenarioId === testId);
}
function stability(testId: string) {
  return testStabilitySummary(testId, props.detail.testRuns);
}
async function setIncluded(test: GeneratedTestScenario, included: boolean) {
  if (!selectable(test) || selectionBusyId.value) return;
  selectionBusyId.value = test.id;
  selectionError.value = "";
  try {
    await $api(`/api/analyses/${analysis.value.id}/tests/${test.id}/review`, { method: "PUT", body: { included } });
    emit("changed");
  } catch (cause: any) {
    selectionError.value = cause?.data?.statusMessage || cause?.message || "시나리오 선택을 저장하지 못했습니다.";
  } finally {
    selectionBusyId.value = "";
  }
}
async function downloadWorkbook() {
  downloading.value = true;
  selectionError.value = "";
  try {
    const blob = await $api<Blob>(`/api/analyses/${analysis.value.id}/tests/export`, { responseType: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `probe-qa-test-scenarios-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (cause: any) {
    selectionError.value = cause?.data?.statusMessage || cause?.message || "시나리오 엑셀 파일을 다운로드하지 못했습니다.";
  } finally {
    downloading.value = false;
  }
}
async function openAdvanced(testId: string) {
  advancedOpen.value = true;
  advancedTarget.value = "";
  await nextTick();
  advancedTarget.value = testId;
  await nextTick();
  document.getElementById("scenario-review-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<template>
  <section class="scenario-review">
    <NuxtLink class="scenario-review__back" to="/analyses">← 분석 이력</NuxtLink>
    <header class="scenario-review__head">
      <div>
        <h1>분석 보고서</h1>
        <div class="scenario-review__meta">
          <strong>{{ analysis.normalizedUrl }}</strong><i />
          <span>{{ formatKoreanDateTime(analysis.createdAt) }}</span><i />
          <b>◐ 확정 대기</b>
          <span>2단계 완료 · 시나리오를 검토하고 실행을 확정해 주세요</span>
        </div>
      </div>
      <button class="primary-button" type="button" :disabled="busy || preflightLoading || !preflight?.canRun || !selectedCount" @click="emit('run')">
        {{ preflightLoading ? '실행 조건 확인 중…' : `확정 시나리오 ${selectedCount}개 실행` }}
      </button>
    </header>

    <nav class="scenario-review__nav" aria-label="보고서 바로가기">
      <a href="#review-preflight">사전 점검</a><a href="#review-scenarios">시나리오 확정</a><a href="#review-page">페이지 분석</a><a href="#review-issues">발견 문제</a>
    </nav>

    <div v-if="actionError" class="error-box">{{ actionError }}</div>
    <div v-if="realtimeWarning" class="scenario-review__notice"><span>{{ realtimeWarning }}</span><button type="button" @click="emit('refresh')">상태 새로고침</button></div>

    <section class="scenario-review__kpis" aria-label="분석 요약">
      <div><span>발견 요소</span><strong>{{ snapshot?.elements.length || 0 }}</strong></div>
      <div><span>생성 시나리오</span><strong>{{ detail.generatedTests.length }}</strong><small>안전 {{ detail.generatedTests.filter(selectable).length }} · 검토 필요 {{ detail.generatedTests.filter((test) => !selectable(test)).length }}</small></div>
      <div><span>확정</span><strong>{{ selectedCount }} <em>/ {{ detail.generatedTests.length }}</em></strong><small>{{ detail.generatedTests.length - selectedCount }}건 제외 예정</small></div>
      <div><span>예상 소요</span><strong>~{{ estimatedMinutes }}분</strong><small>{{ selectedCount }}개 순차 실행</small></div>
    </section>

    <section class="scenario-review__steps" aria-label="QA 분석 단계">
      <div><span>01</span><strong>요구사항 문서 분석</strong><small>{{ detail.documentAnalysis ? '✓ 완료' : '– 문서 없음' }}</small></div>
      <div><span>02</span><strong>페이지·시나리오 분석</strong><small>✓ 완료 · 시나리오 {{ detail.generatedTests.length }}건 생성</small></div>
      <div><span>03</span><strong>확정 시나리오 실행</strong><small>○ 대기 · 확정 후 Playwright 실행</small></div>
    </section>

    <section id="review-preflight" class="scenario-review__section">
      <header><div><span>01</span><div><h2>실행 전 사전 점검</h2><p>환경 오류와 실제 테스트 실패를 구분하기 위해 실행 조건을 먼저 확인합니다.</p></div></div><button class="secondary-button" type="button" :disabled="preflightLoading || busy" @click="emit('check')">{{ preflightLoading ? '확인 중…' : '다시 점검' }}</button></header>
      <div v-if="preflight" class="scenario-review__table preflight-table">
        <div class="scenario-review__table-head"><span>상태</span><span>항목</span><span>결과</span></div>
        <div v-for="check in preflight.checks" :key="check.id" class="preflight-table__row">
          <span class="state-mark" :class="`is-${check.status}`"><b>{{ preflightGlyph(check.status) }}</b>{{ preflightLabel(check.status) }}</span>
          <span><strong>{{ check.label }}</strong><small>{{ check.message }}</small></span>
          <strong>{{ check.status === 'ready' ? '실행 가능' : check.status === 'warning' ? '주의 필요' : '실행 불가' }}</strong>
        </div>
      </div>
      <div v-else-if="preflightError" class="error-box">{{ preflightError }}</div>
      <div v-else class="empty">실행 조건을 확인하고 있습니다.</div>
      <p class="scenario-review__hint">대상 페이지 접근 경고는 실행기 위치에서 결과가 달라질 수 있어 자동으로 차단하지 않습니다.</p>
    </section>

    <section id="review-scenarios" class="scenario-review__section">
      <header><div><span>02</span><div><h2>시나리오 확정</h2><p>체크한 안전 시나리오만 실행합니다. 검토가 필요한 항목은 기본 제외됩니다.</p></div></div><div class="scenario-review__actions"><span>{{ selectedCount }} / {{ detail.generatedTests.length }} 선택</span><button class="secondary-button" type="button" @click="openAdvanced('__new')">새 시나리오 추가</button><button class="secondary-button" type="button" :disabled="downloading || !detail.generatedTests.length" @click="downloadWorkbook">{{ downloading ? '엑셀 생성 중…' : '엑셀 다운로드' }}</button></div></header>
      <div v-if="selectionError" class="error-box">{{ selectionError }}</div>
      <div v-if="detail.generatedTests.length" class="scenario-review__table scenario-table">
        <div class="scenario-review__table-head"><span>#</span><span>시나리오</span><span>유형</span><span>안전성</span><span>신뢰도</span><span>최근 실행</span><span>안정성</span><span></span></div>
        <div v-for="(test, index) in detail.generatedTests" :key="test.id" class="scenario-table__row">
          <label><input type="checkbox" :checked="selectable(test) && isScenarioIncluded(test)" :disabled="!selectable(test) || Boolean(selectionBusyId)" :aria-label="`${test.title} 실행 대상`" @change="setIncluded(test, ($event.target as HTMLInputElement).checked)"><span>{{ index + 1 }}</span></label>
          <span><strong>{{ test.title }}</strong><small>{{ test.sourceElementIds[0] || test.id }}</small></span>
          <span>{{ uiLabel(test.category) }}</span>
          <span class="state-mark" :class="selectable(test) ? 'is-ready' : 'is-warning'"><b>{{ selectable(test) ? '✓' : '◐' }}</b>{{ selectable(test) ? '안전' : '검토 필요' }}</span>
          <span class="mono">{{ Math.round(test.confidence * 100) }}%</span>
          <span>{{ latestRun(test.id) ? testRunStatusLabel(latestRun(test.id)!) : '–' }}</span>
          <span>{{ latestRun(test.id) ? testStabilityLabel(stability(test.id).status) : selectable(test) ? '첫 실행' : '제외 가능성' }}</span>
          <span class="scenario-table__actions"><button type="button" @click="openAdvanced(test.id)">수정 →</button><button v-if="selectable(test)" type="button" :disabled="Boolean(selectionBusyId)" @click="setIncluded(test, !isScenarioIncluded(test))">{{ isScenarioIncluded(test) ? '제외 →' : '포함 →' }}</button></span>
        </div>
      </div>
      <div v-else class="empty">생성된 테스트 시나리오가 없습니다.</div>
    </section>

    <section v-if="advancedOpen && snapshot" id="scenario-review-editor" class="scenario-review__section scenario-review__advanced">
      <header><div><span>+</span><div><h2>시나리오 상세 편집</h2><p>실행 단계·예상 결과·근거를 검토하고 직접 또는 AI로 수정합니다.</p></div></div><button class="secondary-button" type="button" @click="advancedOpen = false">편집 닫기</button></header>
      <GeneratedTestList :analysis-id="analysis.id" :tests="detail.generatedTests" :snapshot="snapshot" :runs="detail.testRuns" review-mode :focus-test-id="advancedTarget" @changed="emit('changed')" />
    </section>

    <details v-if="detail.documentAnalysis" class="scenario-review__requirements">
      <summary>요구사항 분석 및 커버리지 상세 보기 →</summary>
      <RequirementDocumentPanel :document="detail.documentAnalysis" />
      <RequirementCoverage :analysis-id="analysis.id" :document="detail.documentAnalysis" :tests="detail.generatedTests" :runs="detail.testRuns" @changed="emit('changed')" />
    </details>

    <section v-if="snapshot && pageAnalysis" id="review-page" class="scenario-review__section">
      <header><div><span>03</span><div><h2>페이지 분석</h2><p>AI 판단과 실제 수집 근거를 한 화면에서 확인합니다.</p></div></div></header>
      <div class="scenario-review__page">
        <figure><img v-if="screenshot" :src="screenshot" alt="분석 시점 페이지 스크린샷"><div v-else class="empty">저장된 스크린샷이 없습니다.</div><figcaption>{{ snapshot.finalUrl }} · {{ formatKoreanDateTime(snapshot.collectedAt) }}</figcaption></figure>
        <div class="scenario-review__page-copy"><span>{{ uiLabel(pageAnalysis.pageType) }}</span><h3>{{ snapshot.title || '제목 없음' }}</h3><p>{{ pageAnalysis.pagePurpose }}</p><strong>AI가 발견한 기능 {{ pageAnalysis.primaryFunctions.length }}개 · 신뢰도 {{ Math.round(pageAnalysis.confidence * 100) }}%</strong><ul><li v-for="feature in pageAnalysis.primaryFunctions" :key="feature.id"><span>{{ feature.name }}</span><b class="mono">{{ Math.round(feature.confidence * 100) }}%</b></li></ul><details v-if="pageAnalysis.limitations.length"><summary>분석 한계 {{ pageAnalysis.limitations.length }}건 · 근거 요소 보기 →</summary><ul><li v-for="item in pageAnalysis.limitations" :key="item"><span>{{ item }}</span></li></ul></details></div>
      </div>
    </section>

    <IssueList v-if="snapshot && pageAnalysis" id="review-issues" :snapshot="snapshot" :page-analysis="pageAnalysis" compact />
  </section>
</template>

<style scoped>
.scenario-review{width:1200px;margin:0 auto}.scenario-review__back{display:inline-block;margin-bottom:8px;color:var(--text-3);font-size:var(--fs-small);font-weight:var(--fw-medium)}.scenario-review__head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:18px}.scenario-review__head h1{margin:0;font-size:var(--fs-h1);line-height:var(--lh-h1)}.scenario-review__meta{display:flex;align-items:center;gap:10px;margin-top:5px;color:var(--text-3);font-size:var(--fs-meta)}.scenario-review__meta strong{max-width:360px;overflow:hidden;color:var(--ink);font-family:var(--font-mono);font-weight:var(--fw-medium);text-overflow:ellipsis;white-space:nowrap}.scenario-review__meta i{width:2px;height:2px;border-radius:50%;background:var(--text-4)}.scenario-review__meta b{color:var(--ink);font-weight:var(--fw-medium)}.scenario-review__nav{display:flex;width:max-content;gap:2px;margin-bottom:24px;padding:4px;border-radius:var(--r-pill);background:var(--surface-2)}.scenario-review__nav a{padding:5px 12px;border-radius:var(--r-pill);color:var(--text-3);font-size:var(--fs-small);font-weight:var(--fw-medium)}.scenario-review__nav a:first-child{border:1px solid var(--border);background:var(--bg);color:var(--ink)}.scenario-review>.error-box,.scenario-review__notice{margin-bottom:16px;padding:12px 14px}.scenario-review__notice{display:flex;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:var(--r-field);font-size:var(--fs-small)}.scenario-review__notice button{border:0;background:none;font-weight:var(--fw-medium);cursor:pointer}.scenario-review__kpis{display:grid;grid-template-columns:repeat(4,1fr);margin-bottom:18px;overflow:hidden;border-radius:var(--r-card);background:var(--surface)}.scenario-review__kpis>div{display:flex;min-height:92px;flex-direction:column;justify-content:center;padding:16px 24px;border-left:1px solid var(--border)}.scenario-review__kpis>div:first-child{border-left:0}.scenario-review__kpis span{color:var(--text-3);font-size:var(--fs-small)}.scenario-review__kpis strong{margin-top:3px;font-size:var(--fs-kpi);line-height:var(--lh-kpi);font-variant-numeric:tabular-nums}.scenario-review__kpis em{color:var(--text-4);font-style:normal;font-weight:var(--fw-regular)}.scenario-review__kpis small{color:var(--text-4);font-size:var(--fs-meta)}.scenario-review__steps{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-bottom:30px;padding-bottom:24px;border-bottom:1px solid var(--border)}.scenario-review__steps>div{display:grid;grid-template-columns:22px 1fr;gap:2px 10px}.scenario-review__steps span{grid-row:1/3;color:var(--text-4);font-family:var(--font-mono);font-size:var(--fs-meta)}.scenario-review__steps strong{font-size:var(--fs-small)}.scenario-review__steps small{color:var(--text-3);font-size:var(--fs-meta)}.scenario-review__section{padding:30px 0;border-top:1px solid var(--border);scroll-margin-top:70px}.scenario-review__steps+.scenario-review__section{border-top:0;padding-top:0}.scenario-review__section>header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:16px}.scenario-review__section>header>div:first-child{display:flex;align-items:flex-start;gap:12px}.scenario-review__section>header>div:first-child>span{padding-top:3px;color:var(--text-4);font-family:var(--font-mono);font-size:var(--fs-meta)}.scenario-review__section h2{margin:0;font-size:var(--fs-h2);line-height:var(--lh-h2)}.scenario-review__section header p{margin:4px 0 0;color:var(--text-3);font-size:var(--fs-small)}.scenario-review__actions{display:flex;align-items:center;gap:10px}.scenario-review__actions>span{color:var(--text-3);font-size:var(--fs-small)}.scenario-review__table{overflow:hidden;border-radius:var(--r-card);background:var(--surface)}.scenario-review__table-head{display:grid;align-items:center;min-height:34px;padding:0 16px;color:var(--text-3);font-size:var(--fs-meta)}.preflight-table .scenario-review__table-head,.preflight-table__row{grid-template-columns:92px minmax(0,1fr) 100px}.preflight-table__row{display:grid;align-items:center;min-height:58px;margin:0 12px;padding:0 4px;border-bottom:1px solid var(--border);font-size:var(--fs-small)}.preflight-table__row:last-child{border-bottom:0}.preflight-table__row>span:nth-child(2){display:flex;min-width:0;flex-direction:column}.preflight-table__row small{overflow:hidden;color:var(--text-3);font-size:var(--fs-meta);text-overflow:ellipsis;white-space:nowrap}.preflight-table__row>strong:last-child{font-size:var(--fs-small)}.state-mark{display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-small);white-space:nowrap}.state-mark b{font-family:var(--font-mono);font-size:var(--fs-meta)}.state-mark.is-blocked{font-weight:var(--fw-semibold)}.scenario-review__hint{margin:10px 0 0;color:var(--text-4);font-size:var(--fs-meta)}.scenario-table .scenario-review__table-head,.scenario-table__row{grid-template-columns:34px minmax(220px,1fr) 78px 92px 70px 94px 94px 118px}.scenario-table__row{display:grid;align-items:center;min-height:64px;margin:0 12px;padding:0 4px;border-bottom:1px solid var(--border);font-size:var(--fs-small)}.scenario-table__row:last-child{border-bottom:0}.scenario-table__row>label{display:flex;align-items:center;gap:8px}.scenario-table__row input{width:16px;height:16px;margin:0;accent-color:var(--ink)}.scenario-table__row>span:nth-child(2){display:flex;min-width:0;flex-direction:column}.scenario-table__row>span:nth-child(2) strong,.scenario-table__row>span:nth-child(2) small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.scenario-table__row>span:nth-child(2) small{color:var(--text-4);font-family:var(--font-mono);font-size:var(--fs-meta)}.scenario-table__actions{display:flex;justify-content:flex-end;gap:10px}.scenario-table__actions button{padding:0;border:0;background:none;color:var(--text-2);font-size:var(--fs-small);font-weight:var(--fw-medium);cursor:pointer}.scenario-table__actions button:disabled{opacity:.45}.mono{font-family:var(--font-mono)}.scenario-review__advanced :deep(.report-section--tests){padding-top:0!important;border-top:0!important}.scenario-review__requirements{padding:20px 0;border-top:1px solid var(--border)}.scenario-review__requirements>summary{color:var(--text-2);font-size:var(--fs-small);font-weight:var(--fw-medium);cursor:pointer;list-style:none}.scenario-review__requirements[open]>summary{margin-bottom:24px}.scenario-review__page{display:grid;grid-template-columns:440px minmax(0,1fr);gap:32px}.scenario-review__page figure{margin:0}.scenario-review__page figure img,.scenario-review__page figure>.empty{display:block;width:100%;height:300px;object-fit:contain;border:1px solid var(--border);border-radius:var(--r-card);background:var(--surface)}.scenario-review__page figcaption{margin-top:8px;overflow:hidden;color:var(--text-4);font-family:var(--font-mono);font-size:var(--fs-meta);text-overflow:ellipsis;white-space:nowrap}.scenario-review__page-copy>span{color:var(--text-3);font-size:var(--fs-meta)}.scenario-review__page-copy h3{margin:3px 0 6px;font-size:var(--fs-h3)}.scenario-review__page-copy>p{margin:0 0 16px;color:var(--text-2)}.scenario-review__page-copy>strong{font-size:var(--fs-small)}.scenario-review__page-copy ul{margin:8px 0 0;padding:0;list-style:none}.scenario-review__page-copy li{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:34px;border-bottom:1px solid var(--border);font-size:var(--fs-small)}.scenario-review__page-copy li b{color:var(--text-4);font-weight:var(--fw-regular)}.scenario-review__page-copy details{margin-top:12px}.scenario-review__page-copy summary{color:var(--text-3);font-size:var(--fs-small);cursor:pointer;list-style:none}
</style>
