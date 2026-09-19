<script setup lang="ts">
import type { QaDefect, QaDefectSeverity } from "~/shared/types/analysis";
import type { UiAudit, UiAuditReviewStatus, UiAuditRule, UiAuditSeverity } from "~/shared/types/ui-audit";
import { countUiAuditReviews, uiAuditReviewStatusFor } from "~/shared/utils/ui-audit-review";
import { groupUiAuditIssues, UI_AUDIT_RULE_GUIDANCE } from "~/shared/utils/ui-audit-remediation";
const route = useRoute(); const { $api } = useNuxtApp();
const { data, error, refresh } = await useFetch<{ audit: UiAudit }>(`/api/ui-audits/${route.params.auditId}`, { $fetch: $api });
const statusLabel = computed(() => ({ queued: "실행 대기", running: "점검 중", completed: "완료", failed: "실패" }[data.value?.audit.status || "queued"]));
const ruleLabel=(rule:string)=>({horizontal_overflow:"가로 넘침",clipped_content:"콘텐츠 잘림",element_overlap:"요소 겹침",small_target:"작은 클릭 영역",low_contrast:"명암 대비"}[rule]||rule);
const stateLabel=(state:string)=>({initial:"최초 화면",scroll_25:"스크롤 25%",scroll_50:"스크롤 50%",scroll_75:"스크롤 75%",scroll_100:"페이지 하단",scroll_up:"위로 스크롤"}[state]||state);
const comparison = computed(() => data.value?.audit.summary?.comparison);
const comparisonLabel = computed(() => ({matched:"유사",review:"검토 필요",different:"차이 큼"}[comparison.value?.status || "review"]));
const completedDate = computed(() => data.value?.audit.completedAt ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.value.audit.completedAt)) : "");
const initialArtifact = computed(() => data.value?.audit.artifacts.find((artifact) => artifact.state === "initial"));
const diffArtifact = computed(() => data.value?.audit.artifacts.find((artifact) => artifact.state === "design_diff"));
const pageArtifacts = computed(() => data.value?.audit.artifacts.filter((artifact) => artifact.state !== "design_diff") || []);
const artifactForState = (state: string) => pageArtifacts.value.find((artifact) => artifact.state === state && artifact.signedUrl);
const severityFilter = ref<"all" | UiAuditSeverity>("all");
const ruleFilter = ref<"all" | UiAuditRule>("all");
const reviewFilter = ref<"all" | UiAuditReviewStatus>("all");
const issueGroups = computed(() => groupUiAuditIssues(data.value?.audit.issues || []));
const visibleIssueGroups = computed(() => issueGroups.value.filter((group) =>
  (severityFilter.value === "all" || group.severity === severityFilter.value)
  && (ruleFilter.value === "all" || group.rule === ruleFilter.value)
  && (reviewFilter.value === "all" || uiAuditReviewStatusFor(data.value?.audit.reviews || [], group.rule) === reviewFilter.value)
));
const reviewLabels: Record<UiAuditReviewStatus, string> = { unreviewed: "미검토", fix_required: "수정 필요", false_positive: "오탐", deferred: "보류" };
const reviewCounts = computed(() => countUiAuditReviews(issueGroups.value.map((group) => group.rule), data.value?.audit.reviews || []));
const reviewDrafts = reactive<Partial<Record<UiAuditRule, { status: UiAuditReviewStatus; note: string }>>>({});
const reviewFeedback = reactive<Partial<Record<UiAuditRule, "idle" | "saving" | "success" | "error">>>({});
const exportMessage = ref("");
const exporting = ref(false);
const refreshing = ref(false);
const defectDrafts = reactive<Partial<Record<UiAuditRule, { open: boolean; title: string; severity: QaDefectSeverity; note: string }>>>({});
const creatingDefect = ref<UiAuditRule>();
const defectMessage = ref("");
const openDefectForm = (rule: UiAuditRule) => {
  for (const draft of Object.values(defectDrafts)) if (draft) draft.open = false;
  if (defectDrafts[rule]) defectDrafts[rule]!.open = true;
};
watch(issueGroups, (groups) => {
  for (const group of groups) {
    if (reviewDrafts[group.rule]) continue;
    const saved = data.value?.audit.reviews.find((review) => review.rule === group.rule);
    reviewDrafts[group.rule] = { status: saved?.status || "unreviewed", note: saved?.note || "" };
    defectDrafts[group.rule] = { open: false, title: `[UI QA] ${UI_AUDIT_RULE_GUIDANCE[group.rule].label}`, severity: group.severity, note: "" };
  }
}, { immediate: true });
const saveReview = async (rule: UiAuditRule) => {
  const draft = reviewDrafts[rule];
  if (!draft) return;
  reviewFeedback[rule] = "saving";
  try {
    const response = await $api<{ review: UiAudit["reviews"][number] }>(`/api/ui-audits/${route.params.auditId}/reviews`, { method: "PUT", body: { rule, ...draft } });
    const reviews = data.value?.audit.reviews || [];
    if (data.value) data.value.audit.reviews = [...reviews.filter((review) => review.rule !== rule), response.review];
    reviewFeedback[rule] = "success";
  } catch { reviewFeedback[rule] = "error"; }
};
const clearReviewFeedback = (rule: UiAuditRule) => { reviewFeedback[rule] = "idle"; };
const reviewFeedbackMessage = (rule: UiAuditRule) => reviewFeedback[rule] === "success"
  ? "판정을 저장했습니다."
  : reviewFeedback[rule] === "error"
    ? "판정을 저장하지 못했습니다."
    : "";
const createDefect = async (rule: UiAuditRule) => {
  const draft = defectDrafts[rule];
  if (!draft) return;
  creatingDefect.value = rule; defectMessage.value = "";
  try {
    const response = await $api<{ defect: QaDefect }>(`/api/ui-audits/${route.params.auditId}/defects`, { method: "POST", body: { rule, title: draft.title, severity: draft.severity, note: draft.note } });
    const review = data.value?.audit.reviews.find((item) => item.rule === rule);
    if (review) review.defectId = response.defect.id;
    draft.open = false; defectMessage.value = "결함으로 등록했습니다.";
  } catch { defectMessage.value = "결함을 등록하지 못했습니다."; }
  finally { creatingDefect.value = undefined; }
};
const downloadWorkbook = async () => {
  if (!data.value || data.value.audit.status !== "completed") return;
  exporting.value = true; exportMessage.value = "";
  try {
    const blob = await $api<Blob>(`/api/ui-audits/${route.params.auditId}/export`, { responseType: "blob" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = data.value.audit.name.normalize("NFKC").replace(/[^0-9A-Za-z가-힣_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "ui-audit";
    const date = (data.value.audit.completedAt || data.value.audit.createdAt).slice(0, 10).replaceAll("-", "");
    link.href = href; link.download = `ui-qa-report-${safeName}-${date}.xlsx`; link.click();
    URL.revokeObjectURL(href); exportMessage.value = "엑셀 파일을 다운로드했습니다.";
  } catch { exportMessage.value = "엑셀 파일을 다운로드하지 못했습니다."; }
  finally { exporting.value = false; }
};
const severityLabel = (severity: UiAuditSeverity) => ({ high: "높음", medium: "보통", low: "낮음" }[severity]);
const priorityLabel = (severity: UiAuditSeverity) => ({ high: "우선 수정", medium: "다음 수정", low: "개선 권장" }[severity]);
const refreshAudit = async () => {
  if (refreshing.value) return;
  refreshing.value = true;
  try { await refresh(); }
  finally { refreshing.value = false; }
};
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollCount = 0;
const pollUntilFinished = async () => {
  if (!data.value || !["queued", "running"].includes(data.value.audit.status) || pollCount >= 100) return;
  pollCount += 1;
  try {
    const response = await $fetch<{ audit: UiAudit }>(`/api/ui-audits/${route.params.auditId}`);
    data.value = response;
  } catch { /* 다음 자동 조회에서 다시 확인합니다. */ }
  if (["queued", "running"].includes(data.value?.audit.status || "")) pollTimer = setTimeout(pollUntilFinished, 3000);
};
onMounted(() => { if (["queued", "running"].includes(data.value?.audit.status || "")) pollTimer = setTimeout(pollUntilFinished, 3000); });
onBeforeUnmount(() => { if (pollTimer) clearTimeout(pollTimer); });
</script>

<template>
  <div class="section ui-audit-detail">
    <div v-if="error" class="error-box">UI 점검 작업을 불러오지 못했습니다.</div>
    <template v-else-if="data">
      <div class="section-head" :class="{ 'ui-audit-result-head': data.audit.status === 'completed' }">
        <div>
          <NuxtLink v-if="data.audit.status === 'completed'" class="ui-audit-back" to="/analyses">← 목록 이전</NuxtLink>
          <p v-else class="eyebrow">UI QA · 규칙 점검</p>
          <h1>{{ data.audit.status === 'completed' ? 'UI 점검' : data.audit.name }}</h1>
          <p v-if="data.audit.status === 'completed'" class="ui-audit-result-meta"><span class="ui-audit-result-url">{{ data.audit.targetUrl }}</span><span>{{ completedDate }}</span><span>✓ 완료</span><span>규칙 기반 점검 완료 · 화면 크기 {{ data.audit.viewport.width }}×{{ data.audit.viewport.height }} · 디자인 비교 {{ comparison ? comparisonLabel : '없음' }}</span></p>
          <p v-else>{{ data.audit.targetUrl }}</p>
        </div>
        <div class="page-actions">
          <button v-if="data.audit.status === 'completed'" type="button" class="secondary-button" :disabled="exporting" @click="downloadWorkbook">{{ exporting ? "생성 중" : "엑셀 다운로드" }}</button>
          <button type="button" class="secondary-button ui-audit-refresh-button" :disabled="refreshing" :aria-busy="refreshing" @click="refreshAudit">
            <span v-if="data.audit.status !== 'completed'" class="ui-audit-refresh-button__icon" aria-hidden="true">↻</span>
            {{ refreshing ? "새로고침 중..." : data.audit.status === 'completed' ? '새로고침' : '상태 새로고침' }}
          </button>
          <p v-if="exportMessage" class="input-help">{{ exportMessage }}</p>
        </div>
      </div>
      <nav v-if="data.audit.status === 'completed'" class="ui-audit-result-nav" aria-label="UI 점검 결과 메뉴">
        <a href="#ui-audit-summary">결과 요약</a><a v-if="data.audit.issues.length" href="#ui-audit-guide">수정 가이드</a><a v-if="pageArtifacts.length" href="#ui-audit-captures">화면 기록</a>
      </nav>
      <section :id="data.audit.status === 'completed' ? 'ui-audit-summary' : undefined" :class="data.audit.status === 'completed' ? 'ui-audit-complete' : 'card ui-audit-queued'">
        <template v-if="data.audit.status !== 'completed'">
          <span class="status-pill">{{ statusLabel }}</span>
          <h2>{{ data.audit.currentMessage }}</h2>
        </template>
        <dl v-if="data.audit.status !== 'completed'">
          <div><dt>화면 크기</dt><dd>{{ data.audit.viewport.label }} · {{ data.audit.viewport.width }}×{{ data.audit.viewport.height }}</dd></div>
          <div><dt>디자인 비교</dt><dd>{{ comparison ? comparisonLabel : data.audit.reference ? "원본 등록됨 · 비교 대기" : "원본 없음" }}</dd></div>
        </dl>
        <div v-if="data.audit.summary" class="ui-audit-metrics">
          <span><small>전체 문제</small><strong>{{ data.audit.summary.issueCount }}</strong></span>
          <span><small>높음</small><strong>{{ data.audit.summary.highCount }}</strong></span>
          <span><small>보통</small><strong>{{ data.audit.summary.mediumCount }}</strong></span>
          <span><small>낮음</small><strong>{{ data.audit.summary.lowCount }}</strong></span>
        </div>
        <p v-if="data.audit.status === 'completed' && !comparison" class="ui-audit-complete__note">디자인 원본이 없어 규칙 기반 검사만 수행했습니다. 원본을 등록하면 디자인 비교를 함께 추가할 수 있습니다.</p>

        <section v-if="comparison" class="ui-design-comparison">
          <header>
            <div><span>디자인 비교</span><h3>원본 시안과 최초 화면</h3></div>
            <strong :class="`comparison-status comparison-status--${comparison.status}`">{{ comparisonLabel }}</strong>
          </header>
          <div class="ui-design-comparison__metrics">
            <span><small>차이 영역</small><strong>{{ comparison.differencePercent }}%</strong></span>
            <span><small>평균 색상 차이</small><strong>{{ comparison.meanDifferencePercent }}%</strong></span>
          </div>
          <p v-if="comparison.dimensionMismatch" class="input-warning">
            원본 {{ comparison.referenceWidth }}×{{ comparison.referenceHeight }}와 실제 화면 {{ comparison.actualWidth }}×{{ comparison.actualHeight }}의 크기가 달라 비율을 맞춰 비교했습니다.
          </p>
          <div class="ui-design-comparison__frames">
            <figure v-if="data.audit.reference?.signedUrl">
              <img :src="data.audit.reference.signedUrl" :alt="`${data.audit.reference.fileName} 디자인 원본`">
              <figcaption>디자인 원본</figcaption>
            </figure>
            <figure v-if="initialArtifact?.signedUrl">
              <img :src="initialArtifact.signedUrl" alt="실제 페이지 최초 화면">
              <figcaption>실제 페이지</figcaption>
            </figure>
            <figure v-if="diffArtifact?.signedUrl">
              <img :src="diffArtifact.signedUrl" alt="디자인과 실제 페이지의 차이 강조 화면">
              <figcaption>차이 강조 화면</figcaption>
            </figure>
          </div>
          <p>이 비교는 검토 보조 지표입니다. 동적 콘텐츠와 폰트 렌더링 차이는 결함으로 자동 등록하지 않습니다.</p>
        </section>

        <section v-if="data.audit.issues.length" id="ui-audit-guide" class="ui-remediation">
          <header class="ui-remediation__head">
            <div>
              <span>수정 가이드</span>
              <h3>같은 원인을 묶어 우선순위대로 정리했습니다.</h3>
              <p>자동 판정 결과를 숨기지 않고 규칙별 수정 단위로 묶었습니다.</p>
            </div>
            <strong>{{ visibleIssueGroups.length }}개 수정 단위</strong>
          </header>
          <div class="ui-remediation__filters">
            <label>심각도
              <select v-model="severityFilter">
                <option value="all">전체</option>
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
              </select>
            </label>
            <label>문제 유형
              <select v-model="ruleFilter">
                <option value="all">전체</option>
                <option v-for="group in issueGroups" :key="group.rule" :value="group.rule">{{ UI_AUDIT_RULE_GUIDANCE[group.rule].label }} ({{ group.issues.length }})</option>
              </select>
            </label>
            <label>판정 상태
              <select v-model="reviewFilter">
                <option value="all">전체</option>
                <option v-for="(label,status) in reviewLabels" :key="status" :value="status">{{ label }} ({{ reviewCounts[status] }})</option>
              </select>
            </label>
          </div>
          <div class="ui-review-summary">
            <span v-for="(label,status) in reviewLabels" :key="status"><strong>{{ reviewCounts[status] }}</strong>{{ label }}</span>
            <p v-if="defectMessage" aria-live="polite">{{ defectMessage }}</p>
          </div>
          <div v-if="visibleIssueGroups.length" class="ui-remediation__groups">
            <article v-for="(group, index) in visibleIssueGroups" :key="group.rule" class="ui-remediation-group">
              <header>
                <span class="ui-remediation-group__number">{{ String(index + 1).padStart(2, '0') }}</span>
                <div><h3>{{ UI_AUDIT_RULE_GUIDANCE[group.rule].label }} <span :class="`severity severity--${group.severity}`">{{ severityLabel(group.severity) }}</span></h3><p>영향 요소 {{ group.affectedCount }}개 · 확인 화면 {{ group.stateCount }}개</p></div>
                <strong>{{ priorityLabel(group.severity) }}</strong>
              </header>
              <div class="ui-remediation-guide">
                <div><small>발생 이유</small><p>{{ UI_AUDIT_RULE_GUIDANCE[group.rule].reason }}</p></div>
                <div><small>권장 수정</small><p>{{ UI_AUDIT_RULE_GUIDANCE[group.rule].recommendation }}</p></div>
                <div><small>확인 기준</small><p>{{ UI_AUDIT_RULE_GUIDANCE[group.rule].standard }}</p></div>
              </div>
              <details>
                <summary>영향 요소 {{ group.issues.length }}건 보기</summary>
                <div class="ui-remediation-elements">
                  <article v-for="issue in group.issues" :key="issue.id">
                    <header><strong>{{ issue.title }}</strong><small>{{ stateLabel(issue.state) }}</small></header>
                    <p>{{ issue.message }}</p>
                    <a v-if="artifactForState(issue.state)?.signedUrl" class="ui-remediation-evidence" :href="artifactForState(issue.state)!.signedUrl" target="_blank" rel="noopener noreferrer">
                      <img :src="artifactForState(issue.state)!.signedUrl" :alt="`${issue.title} 발견 당시 ${stateLabel(issue.state)} 화면`">
                      <span><strong>발견 당시 화면</strong><small>{{ stateLabel(issue.state) }} · 새 창에서 크게 보기</small></span>
                    </a>
                    <code>{{ issue.selector }}</code>
                    <dl><div v-for="(value,key) in issue.actual" :key="key"><dt>{{ key }}</dt><dd>{{ value }}</dd></div></dl>
                  </article>
                </div>
              </details>
              <div v-if="reviewDrafts[group.rule]" class="ui-remediation-review">
                <label>판정
                  <select v-model="reviewDrafts[group.rule]!.status" @input="clearReviewFeedback(group.rule)">
                    <option v-for="(label,status) in reviewLabels" :key="status" :value="status">{{ label }}</option>
                  </select>
                </label>
                <label>메모
                  <input v-model="reviewDrafts[group.rule]!.note" maxlength="1000" placeholder="판정 근거를 선택적으로 입력하세요." @input="clearReviewFeedback(group.rule)">
                </label>
                <div class="ui-remediation-review__actions">
                  <button type="button" class="secondary-button" :disabled="reviewFeedback[group.rule] === 'saving'" @click="saveReview(group.rule)">{{ reviewFeedback[group.rule] === "saving" ? "저장 중..." : "저장" }}</button>
                  <p class="ui-remediation-review__status" :class="{ 'is-success': reviewFeedback[group.rule] === 'success', 'is-error': reviewFeedback[group.rule] === 'error' }" role="status" aria-live="polite">{{ reviewFeedbackMessage(group.rule) || "\u00a0" }}</p>
                </div>
              </div>
              <div v-if="uiAuditReviewStatusFor(data.audit.reviews, group.rule) === 'fix_required'" class="ui-defect-registration">
                <NuxtLink v-if="data.audit.reviews.find(item => item.rule === group.rule)?.defectId" class="secondary-button" :to="`/defects?defect=${data.audit.reviews.find(item => item.rule === group.rule)?.defectId}`">결함 등록됨 · 상세 보기</NuxtLink>
                <template v-else-if="defectDrafts[group.rule]">
                  <button v-if="!defectDrafts[group.rule]!.open" type="button" class="secondary-button" @click="openDefectForm(group.rule)">결함으로 등록</button>
                  <form v-else class="ui-defect-registration__form" @submit.prevent="createDefect(group.rule)">
                    <label>결함 제목<input v-model="defectDrafts[group.rule]!.title" required maxlength="160"></label>
                    <label>심각도<select v-model="defectDrafts[group.rule]!.severity"><option value="critical">치명적</option><option value="high">높음</option><option value="medium">보통</option><option value="low">낮음</option></select></label>
                    <label>담당 메모<textarea v-model="defectDrafts[group.rule]!.note" maxlength="1000" rows="2" /></label>
                    <div><button type="button" class="secondary-button" @click="defectDrafts[group.rule]!.open = false">취소</button><button type="submit" class="secondary-button" :disabled="creatingDefect === group.rule">{{ creatingDefect === group.rule ? "등록 중" : "결함 등록" }}</button></div>
                  </form>
                </template>
              </div>
            </article>
          </div>
          <p v-else class="empty">선택한 조건에 해당하는 문제가 없습니다.</p>
        </section>
        <p v-else-if="data.audit.status === 'completed'" class="notice">자동 판정 가능한 UI 규칙 위반을 발견하지 못했습니다.</p>
        <section v-if="pageArtifacts.length" id="ui-audit-captures" class="ui-audit-captures" aria-labelledby="ui-audit-captures-title">
          <header>
            <div><span>화면 기록</span><h3 id="ui-audit-captures-title">점검 과정에서 수집한 전체 화면</h3></div>
            <p>페이지를 단계별로 스크롤하며 검사한 화면입니다. 각 문제의 상세 영역에서도 관련 화면을 확인할 수 있습니다.</p>
          </header>
          <div class="ui-audit-screenshots">
            <figure v-for="artifact in pageArtifacts" :key="artifact.id">
              <a v-if="artifact.signedUrl" :href="artifact.signedUrl" target="_blank" rel="noopener noreferrer">
                <img :src="artifact.signedUrl" :alt="`${stateLabel(artifact.state)} 전체 화면`">
              </a>
              <figcaption><strong>{{ stateLabel(artifact.state) }}</strong><span>{{ artifact.width }}×{{ artifact.height }} · 크게 보기</span></figcaption>
            </figure>
          </div>
        </section>
        <figure v-if="data.audit.reference?.signedUrl && !comparison" class="design-reference-preview">
          <img :src="data.audit.reference.signedUrl" :alt="`${data.audit.reference.fileName} 디자인 원본`">
          <figcaption>디자인 원본 · {{ data.audit.reference.fileName }} · {{ data.audit.reference.width }}×{{ data.audit.reference.height }}</figcaption>
        </figure>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ui-audit-detail { width: 100%; max-width: none; margin-top: 0; }
.ui-audit-result-head { align-items: end; margin-bottom: var(--section-gap); }
.ui-audit-result-head h1 { margin: 6px 0 0; font-size: var(--fs-h1); line-height: var(--lh-h1); }
.ui-audit-back { color: var(--text-3); font-size: var(--fs-meta); text-decoration: none; }
.ui-audit-result-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 0; color: var(--text-3); font-size: var(--fs-meta); }
.ui-audit-result-meta > span + span::before { content: '/'; margin-right: 8px; color: var(--border); }
.ui-audit-result-url { color: var(--ink); font-family: var(--font-mono); overflow-wrap: anywhere; }
.ui-audit-result-head .page-actions { flex: none; }
.ui-audit-result-head .secondary-button { min-height: var(--h-btn-sm); font-size: var(--fs-small); }
.ui-audit-result-head .ui-audit-refresh-button { border-color: var(--border); color: var(--ink); box-shadow: none; font-weight: var(--fw-medium); }
.ui-audit-result-head .secondary-button:hover:not(:disabled),.ui-audit-complete .secondary-button:hover:not(:disabled) { border-color: var(--ink); background: var(--bg); color: var(--ink); box-shadow: none; }
.ui-audit-result-nav { display: flex; width: max-content; gap: 2px; margin-bottom: var(--section-gap); padding: 4px; border-radius: var(--r-pill); background: var(--surface-2); }
.ui-audit-result-nav a { padding: 5px 12px; border-radius: var(--r-pill); color: var(--text-3); font-size: var(--fs-small); text-decoration: none; }
.ui-audit-result-nav a:first-child { border: 1px solid var(--border); background: var(--bg); color: var(--ink); }
.ui-audit-complete { display: grid; gap: var(--section-gap); }
.ui-audit-complete .ui-audit-metrics { gap: 0; overflow: hidden; border-radius: var(--r-card); background: var(--surface); }
.ui-audit-complete .ui-audit-metrics span { display: flex; flex-direction: column; align-items: start; gap: 6px; padding: var(--panel-pad); border: 0; border-left: 1px solid var(--border); border-radius: 0; background: transparent; color: var(--ink); }
.ui-audit-complete .ui-audit-metrics span:first-child { border: 0; background: transparent; }
.ui-audit-complete .ui-audit-metrics small { color: var(--text-3); font-size: var(--fs-meta); }
.ui-audit-complete .ui-audit-metrics strong { font-size: var(--fs-kpi); line-height: var(--lh-kpi); font-weight: var(--fw-semibold); }
.ui-audit-complete__note { margin: -12px 0 0; color: var(--text-3); font-size: var(--fs-meta); }
.ui-audit-complete .ui-remediation,.ui-audit-complete .ui-audit-captures,.ui-audit-complete .ui-design-comparison { margin: 0; padding: var(--report-gap) 0 0; border: 0; border-top: 1px solid var(--border); border-radius: 0; background: var(--bg); }
.ui-audit-complete .ui-remediation__head > div > span,.ui-audit-complete .ui-audit-captures > header span { color: var(--text-4); font-family: var(--font-mono); font-size: var(--fs-meta); font-weight: var(--fw-regular); letter-spacing: 0; }
.ui-audit-complete .ui-remediation__head h3,.ui-audit-complete .ui-audit-captures > header h3 { margin: 4px 0 0; font-size: var(--fs-h2); line-height: var(--lh-h2); font-weight: var(--fw-semibold); }
.ui-audit-complete .ui-remediation__head p,.ui-audit-complete .ui-audit-captures > header p { color: var(--text-3); font-size: var(--fs-meta); }
.ui-audit-complete .ui-remediation__head > strong { padding: 0; border: 0; background: none; color: var(--text-3); font-size: var(--fs-meta); font-weight: var(--fw-regular); }
.ui-audit-complete .ui-remediation__filters { position: static; width: max-content; gap: 8px; padding: 0; border: 0; background: none; box-shadow: none; }
.ui-audit-complete .ui-remediation__filters label { gap: 4px; color: var(--text-3); font-size: var(--fs-meta); font-weight: var(--fw-regular); }
.ui-audit-complete .ui-remediation__filters select { min-height: var(--h-btn-sm); border-color: var(--border); border-radius: var(--r-pill); font-size: var(--fs-meta); }
.ui-audit-complete .ui-review-summary { justify-content: end; margin-top: -46px; }
.ui-audit-complete .ui-review-summary span { border: 0; color: var(--text-3); font-size: var(--fs-meta); }
.ui-audit-complete .ui-review-summary span strong { order: 1; font-size: var(--fs-meta); }
.ui-audit-complete .ui-remediation-group { border: 1px solid var(--border); border-radius: var(--r-card); background: var(--bg); box-shadow: none; }
.ui-audit-complete .ui-remediation-group > header { grid-template-columns: 28px minmax(0,1fr) auto; gap: 12px; padding: var(--panel-pad); border: 0; border-left: 0; }
.ui-remediation-group__number { color: var(--text-4); font-family: var(--font-mono); font-size: var(--fs-meta); }
.ui-audit-complete .ui-remediation-group > header h3 { margin: 0; font-size: var(--fs-h3); line-height: var(--lh-h3); font-weight: var(--fw-semibold); }
.ui-audit-complete .ui-remediation-group > header p,.ui-audit-complete .ui-remediation-group > header > strong { color: var(--text-3); font-size: var(--fs-meta); font-weight: var(--fw-regular); }
.ui-audit-complete .severity { display: inline; padding: 0; border: 0; background: none; color: var(--ink); font-size: var(--fs-small); font-weight: var(--fw-medium); }
.ui-audit-complete .severity--high,.ui-audit-complete .ui-remediation-group:has(.severity--high) > header > strong { font-weight: var(--fw-semibold); }
.ui-audit-complete .severity--low,.ui-audit-complete .ui-remediation-group:has(.severity--low) > header > strong { color: var(--text-3); font-weight: var(--fw-regular); }
.ui-audit-complete .ui-remediation-group:has(.severity--medium) > header > strong { color: var(--ink); font-weight: var(--fw-medium); }
.ui-audit-complete .ui-remediation-guide { gap: var(--field-gap); padding: 0 var(--panel-pad); background: none; }
.ui-audit-complete .ui-remediation-guide > div { padding: var(--inner-card-pad); border-radius: var(--r-inner); background: var(--surface); }
.ui-audit-complete .ui-remediation-guide small { color: var(--text-3); font-size: var(--fs-meta); font-weight: var(--fw-regular); letter-spacing: 0; }
.ui-audit-complete .ui-remediation-guide p { margin-top: 6px; color: var(--text-2); font-size: var(--fs-small); line-height: var(--lh-small); }
.ui-audit-complete .ui-remediation-group > details { margin: 0 var(--panel-pad); border: 0; border-bottom: 1px solid var(--border); }
.ui-audit-complete .ui-remediation-group > details > summary { padding: var(--inner-card-pad) 0; color: var(--ink); font-size: var(--fs-small); font-weight: var(--fw-medium); }
.ui-audit-complete .ui-remediation-elements { padding: 0 0 var(--inner-card-pad); }
.ui-audit-complete .ui-remediation-elements > article { border-color: var(--border); background: var(--bg); }
.ui-audit-complete .ui-remediation-elements > article > header strong { font-size: var(--fs-body); font-weight: var(--fw-medium); }
.ui-audit-complete .ui-remediation-elements > article > header small { color: var(--text-3); font-size: var(--fs-meta); }
.ui-audit-complete .ui-remediation-elements > article > p { color: var(--text-2); font-size: var(--fs-small); line-height: var(--lh-small); }
.ui-audit-complete .ui-remediation-elements code { font-size: var(--fs-meta); }
.ui-audit-complete .ui-remediation-elements dl { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; padding: 0; border: 0; }
.ui-audit-complete .ui-remediation-elements dl > div { font-size: var(--fs-meta); }
.ui-audit-complete .ui-remediation-elements dl dt { color: var(--text-3); }
.ui-audit-complete .ui-remediation-elements dl dd { font-weight: var(--fw-medium); }
.ui-audit-complete .ui-remediation-evidence { grid-template-columns: 200px minmax(0,1fr); border-color: var(--border); background: var(--surface); }
.ui-audit-complete .ui-remediation-evidence:hover { border-color: var(--ink); background: var(--surface); }
.ui-audit-complete .ui-remediation-evidence img { width: 200px; height: 112px; background: var(--bg); }
.ui-audit-complete .ui-remediation-evidence span strong { font-size: var(--fs-small); font-weight: var(--fw-medium); }
.ui-audit-complete .ui-remediation-evidence span small { color: var(--text-3); font-size: var(--fs-meta); }
.ui-audit-complete .ui-remediation-elements dl > div { background: var(--surface); }
.ui-audit-complete .ui-remediation-review { grid-template-columns: 140px minmax(0,1fr) auto; align-items: center; gap: 8px; padding: var(--inner-card-pad) var(--panel-pad); border: 0; background: var(--bg); }
.ui-audit-complete .ui-remediation-review label { display: flex; align-items: center; gap: 8px; color: var(--ink); font-size: var(--fs-meta); font-weight: var(--fw-medium); }
.ui-audit-complete .ui-remediation-review select,.ui-audit-complete .ui-remediation-review input { min-width: 0; width: 100%; height: var(--h-input-sm); min-height: var(--h-input-sm); border: 1px solid var(--border); border-radius: var(--r-pill); background: var(--bg); font-size: var(--fs-meta); }
.ui-audit-complete .ui-remediation-review input { padding: 0 12px; }
.ui-audit-complete .ui-remediation-review__actions { display: flex; align-items: center; gap: 8px; }
.ui-audit-complete .ui-remediation-review__actions button { min-height: var(--h-btn-sm); }
.ui-audit-complete .ui-remediation-review__status.is-success,.ui-audit-complete .ui-remediation-review__status.is-error { color: var(--ink); }
.ui-audit-complete .ui-remediation-review__status { color: var(--text-3); font-size: var(--fs-meta); }
.ui-audit-complete :is(input,select,textarea,summary,button,a):focus-visible,.ui-audit-result-head :is(button,a):focus-visible { outline-color: var(--ink); }
.ui-audit-complete .ui-defect-registration { border-color: var(--border); }
.ui-audit-complete .ui-audit-screenshots { grid-template-columns: repeat(3,minmax(0,1fr)); }
.ui-audit-complete .ui-audit-screenshots figure { border: 0; border-radius: 0; background: var(--bg); }
.ui-audit-complete .ui-audit-screenshots figure > a { padding: 0; border-radius: var(--r-inner); background: var(--surface); }
.ui-audit-complete .ui-audit-screenshots img { height: 200px; max-height: none; border-radius: var(--r-inner); background: var(--surface); object-fit: contain; }
.ui-audit-complete .ui-audit-screenshots figcaption { padding: 8px 0; color: var(--text-3); font-size: var(--fs-meta); }
.ui-audit-complete .ui-audit-screenshots figcaption strong { color: var(--ink); font-weight: var(--fw-medium); }
.ui-audit-complete .ui-design-comparison > header span,.ui-audit-complete .ui-design-comparison > p { color: var(--text-3); }
.ui-audit-complete .ui-design-comparison > header span { font-size: var(--fs-meta); font-weight: var(--fw-medium); }
.ui-audit-complete .ui-design-comparison__metrics small,.ui-audit-complete .ui-design-comparison__frames figcaption { color: var(--text-3); font-size: var(--fs-meta); }
.ui-audit-complete .ui-design-comparison__metrics strong { font-size: var(--fs-h2); }
.ui-audit-complete .ui-design-comparison__metrics span,.ui-audit-complete .ui-design-comparison__frames figure { border-color: var(--border); border-radius: var(--r-inner); background: var(--surface); }
.ui-audit-complete .ui-design-comparison__frames img { background: var(--surface); }
.ui-audit-complete .comparison-status { border: 0; background: none; color: var(--ink); }
</style>
