<script setup lang="ts">
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
const initialArtifact = computed(() => data.value?.audit.artifacts.find((artifact) => artifact.state === "initial"));
const diffArtifact = computed(() => data.value?.audit.artifacts.find((artifact) => artifact.state === "design_diff"));
const pageArtifacts = computed(() => data.value?.audit.artifacts.filter((artifact) => artifact.state !== "design_diff") || []);
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
const savingRule = ref<UiAuditRule>();
const reviewMessage = ref("");
watch(issueGroups, (groups) => {
  for (const group of groups) {
    if (reviewDrafts[group.rule]) continue;
    const saved = data.value?.audit.reviews.find((review) => review.rule === group.rule);
    reviewDrafts[group.rule] = { status: saved?.status || "unreviewed", note: saved?.note || "" };
  }
}, { immediate: true });
const saveReview = async (rule: UiAuditRule) => {
  const draft = reviewDrafts[rule];
  if (!draft) return;
  savingRule.value = rule; reviewMessage.value = "";
  try {
    const response = await $api<{ review: UiAudit["reviews"][number] }>(`/api/ui-audits/${route.params.auditId}/reviews`, { method: "PUT", body: { rule, ...draft } });
    const reviews = data.value?.audit.reviews || [];
    if (data.value) data.value.audit.reviews = [...reviews.filter((review) => review.rule !== rule), response.review];
    reviewMessage.value = "판정을 저장했습니다.";
  } catch { reviewMessage.value = "판정을 저장하지 못했습니다."; }
  finally { savingRule.value = undefined; }
};
const severityLabel = (severity: UiAuditSeverity) => ({ high: "높음", medium: "보통", low: "낮음" }[severity]);
const priorityLabel = (severity: UiAuditSeverity) => ({ high: "우선 수정", medium: "다음 수정", low: "개선 권장" }[severity]);
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollCount = 0;
const pollUntilFinished = async () => {
  if (!data.value || !["queued", "running"].includes(data.value.audit.status) || pollCount >= 100) return;
  pollCount += 1;
  await refresh();
  if (["queued", "running"].includes(data.value?.audit.status || "")) pollTimer = setTimeout(pollUntilFinished, 3000);
};
onMounted(() => { if (["queued", "running"].includes(data.value?.audit.status || "")) pollTimer = setTimeout(pollUntilFinished, 3000); });
onBeforeUnmount(() => { if (pollTimer) clearTimeout(pollTimer); });
</script>

<template>
  <div class="section ui-audit-detail">
    <div v-if="error" class="error-box">UI 점검 작업을 불러오지 못했습니다.</div>
    <template v-else-if="data">
      <div class="section-head">
        <div><p class="eyebrow">UI QA · 규칙 점검</p><h1>{{ data.audit.name }}</h1><p>{{ data.audit.targetUrl }}</p></div>
        <button type="button" class="secondary-button" @click="() => refresh()">상태 새로고침</button>
      </div>
      <section class="card ui-audit-queued">
        <span class="status-pill">{{ statusLabel }}</span>
        <h2>{{ data.audit.currentMessage }}</h2>
        <dl>
          <div><dt>화면 크기</dt><dd>{{ data.audit.viewport.label }} · {{ data.audit.viewport.width }}×{{ data.audit.viewport.height }}</dd></div>
          <div><dt>디자인 비교</dt><dd>{{ comparison ? comparisonLabel : data.audit.reference ? "원본 등록됨 · 비교 대기" : "원본 없음" }}</dd></div>
        </dl>
        <div v-if="data.audit.summary" class="ui-audit-metrics">
          <span><strong>{{ data.audit.summary.issueCount }}</strong>전체 문제</span>
          <span><strong>{{ data.audit.summary.highCount }}</strong>높음</span>
          <span><strong>{{ data.audit.summary.mediumCount }}</strong>보통</span>
          <span><strong>{{ data.audit.summary.lowCount }}</strong>낮음</span>
        </div>

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
              <figcaption>차이 강조 · 붉은 영역 확인</figcaption>
            </figure>
          </div>
          <p>이 비교는 검토 보조 지표입니다. 동적 콘텐츠와 폰트 렌더링 차이는 결함으로 자동 등록하지 않습니다.</p>
        </section>

        <section v-if="data.audit.issues.length" class="ui-remediation">
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
            <p v-if="reviewMessage" aria-live="polite">{{ reviewMessage }}</p>
          </div>
          <div v-if="visibleIssueGroups.length" class="ui-remediation__groups">
            <article v-for="group in visibleIssueGroups" :key="group.rule" class="ui-remediation-group">
              <header>
                <span :class="`severity severity--${group.severity}`">{{ severityLabel(group.severity) }}</span>
                <div><h3>{{ UI_AUDIT_RULE_GUIDANCE[group.rule].label }}</h3><p>영향 요소 {{ group.affectedCount }}개 · 확인 화면 {{ group.stateCount }}개</p></div>
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
                    <code>{{ issue.selector }}</code>
                    <dl><div v-for="(value,key) in issue.actual" :key="key"><dt>{{ key }}</dt><dd>{{ value }}</dd></div></dl>
                  </article>
                </div>
              </details>
              <div v-if="reviewDrafts[group.rule]" class="ui-remediation-review">
                <label>판정
                  <select v-model="reviewDrafts[group.rule]!.status">
                    <option v-for="(label,status) in reviewLabels" :key="status" :value="status">{{ label }}</option>
                  </select>
                </label>
                <label>메모
                  <textarea v-model="reviewDrafts[group.rule]!.note" maxlength="1000" rows="2" placeholder="판정 근거를 선택적으로 입력하세요." />
                </label>
                <button type="button" class="secondary-button" :disabled="savingRule === group.rule" @click="saveReview(group.rule)">{{ savingRule === group.rule ? "저장 중" : "저장" }}</button>
              </div>
            </article>
          </div>
          <p v-else class="empty">선택한 조건에 해당하는 문제가 없습니다.</p>
        </section>
        <p v-else-if="data.audit.status === 'completed'" class="notice">자동 판정 가능한 UI 규칙 위반을 발견하지 못했습니다.</p>
        <div v-if="pageArtifacts.length" class="ui-audit-screenshots">
          <figure v-for="artifact in pageArtifacts" :key="artifact.id">
            <img v-if="artifact.signedUrl" :src="artifact.signedUrl" :alt="`${stateLabel(artifact.state)} 화면`">
            <figcaption>{{ stateLabel(artifact.state) }} · {{ artifact.width }}×{{ artifact.height }}</figcaption>
          </figure>
        </div>
        <figure v-if="data.audit.reference?.signedUrl && !comparison" class="design-reference-preview">
          <img :src="data.audit.reference.signedUrl" :alt="`${data.audit.reference.fileName} 디자인 원본`">
          <figcaption>디자인 원본 · {{ data.audit.reference.fileName }} · {{ data.audit.reference.width }}×{{ data.audit.reference.height }}</figcaption>
        </figure>
      </section>
    </template>
  </div>
</template>
