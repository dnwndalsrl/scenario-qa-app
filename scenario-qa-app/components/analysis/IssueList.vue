<script setup lang="ts">
import type { AiPageAnalysis, PageRisk, PageSnapshot } from "~/shared/types/analysis";
import { formatKoreanDateTime } from "~/utils/date-format";

type IssueCategory = "analysis" | "console" | "network";
type IssueTone = "danger" | "warning" | "neutral";

interface ReportIssue {
  id: string;
  category: IssueCategory;
  title: string;
  summary: string;
  verdict: string;
  tone: IssueTone;
  evidenceSummary: string;
  evidence: string[];
  recommendation: string;
}

const props = withDefaults(defineProps<{ snapshot: PageSnapshot; pageAnalysis: AiPageAnalysis; compact?: boolean; sectionNumber?: string }>(), { compact: false, sectionNumber: "04" });
const activeFilter = ref<"all" | IssueCategory>("all");
const showAllCompact = ref(false);

const categoryMeta: Record<IssueCategory, { label: string; description: string }> = {
  analysis: { label: "분석 확인 필요", description: "페이지 구조와 콘텐츠를 바탕으로 발견한 항목" },
  console: { label: "콘솔 메시지", description: "브라우저 실행 중 수집된 오류와 경고" },
  network: { label: "네트워크 요청", description: "실패하거나 비정상 상태로 응답한 요청" }
};

const issues = computed<ReportIssue[]>(() => [
  ...props.pageAnalysis.risks.map(toAnalysisIssue),
  ...props.snapshot.consoleMessages.map((item): ReportIssue => ({
    id: item.id,
    category: "console",
    title: item.type === "pageerror" ? "페이지 스크립트 실행 오류" : `브라우저 콘솔 ${item.type === "error" ? "오류" : "경고"}`,
    summary: "페이지 실행 중 브라우저 콘솔 메시지가 수집되었습니다.",
    verdict: item.type === "warning" ? "확인 필요" : "오류 가능성",
    tone: item.type === "warning" ? "warning" : "danger",
    evidenceSummary: "콘솔 메시지 1건",
    evidence: [item.text, `수집 시각 ${formatDate(item.recordedAt)}`],
    recommendation: item.text.includes("postMessage")
      ? "메시지를 보내는 origin과 수신 측의 허용 origin 검증 로직을 확인하세요."
      : "실제 브라우저에서도 재현되는지 확인하고 해당 스크립트의 호출 경로를 점검하세요."
  })),
  ...props.snapshot.networkIssues.map((item): ReportIssue => {
    const external = isExternalUrl(item.url);
    const status = item.status ? `HTTP ${item.status}` : item.failureText || "요청 실패";
    return {
      id: item.id,
      category: "network",
      title: external ? "외부 서비스 요청 실패" : "페이지 네트워크 요청 실패",
      summary: `${requestTarget(item.url)} 요청이 ${status} 상태로 수집되었습니다.`,
      verdict: external ? "환경 영향" : item.status && item.status >= 500 ? "오류 가능성" : "확인 필요",
      tone: external ? "neutral" : item.status && item.status >= 500 ? "danger" : "warning",
      evidenceSummary: `${item.method} 요청 1건`,
      evidence: [`${item.method} ${item.url}`, status, `수집 시각 ${formatDate(item.recordedAt)}`],
      recommendation: external
        ? "광고 차단 확장이나 실행 환경의 외부 요청 제한 없이 다시 확인하고, 서비스 장애 시 대체 동작도 점검하세요."
        : "요청 URL과 서버 응답 로그를 확인하고 동일 요청이 실제 사용자 환경에서도 실패하는지 재검증하세요."
    };
  })
]);

const filters = computed(() => [
  { value: "all" as const, label: "전체", count: issues.value.length },
  ...(["analysis", "console", "network"] as const).map(value => ({ value, label: categoryMeta[value].label, count: issues.value.filter(issue => issue.category === value).length }))
]);

const groupedIssues = computed(() => (["analysis", "console", "network"] as const)
  .map(category => ({ category, ...categoryMeta[category], items: issues.value.filter(issue => issue.category === category && (activeFilter.value === "all" || activeFilter.value === category)) }))
  .filter(group => group.items.length));

const urgentCount = computed(() => issues.value.filter(issue => issue.tone === "danger").length);
const filteredIssues = computed(() => issues.value.filter((issue) => activeFilter.value === "all" || issue.category === activeFilter.value));
const compactIssues = computed(() => showAllCompact.value ? filteredIssues.value : filteredIssues.value.slice(0, 4));
const remainingCompactCount = computed(() => Math.max(0, filteredIssues.value.length - compactIssues.value.length));

function toAnalysisIssue(risk: PageRisk): ReportIssue {
  const evidenceCount = risk.relatedElementIds.length;
  return {
    id: risk.id,
    category: "analysis",
    title: risk.title,
    summary: risk.description,
    verdict: risk.severity === "high" ? "우선 확인" : "확인 필요",
    tone: risk.severity === "high" ? "danger" : risk.severity === "medium" ? "warning" : "neutral",
    evidenceSummary: evidenceCount ? `관련 요소 ${evidenceCount}개` : "페이지 전반",
    evidence: evidenceCount ? risk.relatedElementIds : ["특정 요소가 아닌 페이지 전반에서 발견"],
    recommendation: recommendationFor(risk)
  };
}

function recommendationFor(risk: PageRisk): string {
  const text = `${risk.title} ${risk.description}`.toLowerCase();
  if (text.includes("postmessage") || text.includes("교차출처")) return "메시지 발신 origin과 수신 측 허용 목록이 일치하는지 확인하세요.";
  if (text.includes("쿠키") || text.includes("추적")) return "사용자 동의 UI와 개인정보 처리 고지, 동의 전 추적 요청 차단 여부를 확인하세요.";
  if (text.includes("스크립트") || text.includes("네트워크")) return "광고 차단 확장 없이 재현 여부를 확인하고 외부 서비스 실패 시 페이지의 대체 동작을 점검하세요.";
  return "실제 사용자 환경에서 재현한 뒤 관련 요구사항과 구현 결과가 일치하는지 확인하세요.";
}

function isExternalUrl(value: string): boolean {
  try { return new URL(value, props.snapshot.finalUrl).origin !== new URL(props.snapshot.finalUrl).origin; }
  catch { return false; }
}

function requestTarget(value: string): string {
  try { const url = new URL(value, props.snapshot.finalUrl); return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`; }
  catch { return value; }
}

function formatDate(value: string): string {
  return formatKoreanDateTime(value);
}
</script>

<template>
  <section class="section card report-section report-section--issues">
    <div class="section-head issue-section-head">
      <div>
        <h2><span v-if="compact" class="issue-section-number">{{ sectionNumber }}</span>발견 문제 <span v-if="issues.length" class="issue-total">{{ issues.length }}건</span></h2>
        <p>테스트 결과와 별도로 수집한 항목입니다. 실제 결함 여부는 판정과 근거를 함께 확인해 주세요.</p>
      </div>
      <div v-if="issues.length" class="issue-overview" aria-label="발견 문제 요약">
        <span>전체 <strong>{{ issues.length }}</strong></span>
        <span>우선 확인 <strong>{{ urgentCount }}</strong></span>
      </div>
    </div>

    <div v-if="!issues.length" class="empty">현재 수집 범위에서 발견된 문제가 없습니다.</div>
    <template v-else-if="compact">
      <div class="issue-filters" aria-label="문제 유형 필터">
        <button v-for="filter in filters" :key="filter.value" type="button" :class="{ active: activeFilter === filter.value }" :aria-pressed="activeFilter === filter.value" @click="activeFilter = filter.value; showAllCompact = false">
          {{ filter.label }} <span>{{ filter.count }}</span>
        </button>
      </div>
      <div class="compact-issues">
        <div class="compact-issues__head"><span>판정</span><span>항목</span><span>근거</span></div>
        <details v-for="issue in compactIssues" :key="issue.id" class="compact-issue">
          <summary><strong>{{ issue.verdict }}</strong><span><b>{{ issue.title }}</b><small>{{ issue.summary }}</small></span><em>{{ issue.evidenceSummary }}</em></summary>
          <div><section><strong>발견 근거</strong><ul><li v-for="evidence in issue.evidence" :key="evidence">{{ evidence }}</li></ul></section><section><strong>권장 조치</strong><p>{{ issue.recommendation }}</p></section></div>
        </details>
      </div>
      <button v-if="remainingCompactCount" class="compact-issues__more" type="button" @click="showAllCompact = true">나머지 {{ remainingCompactCount }}건 보기</button>
      <button v-else-if="showAllCompact && filteredIssues.length > 4" class="compact-issues__more" type="button" @click="showAllCompact = false">접기</button>
    </template>
    <template v-else>
      <div class="issue-filters" aria-label="문제 유형 필터">
        <button v-for="filter in filters" :key="filter.value" type="button" :class="{ active: activeFilter === filter.value }" :aria-pressed="activeFilter === filter.value" @click="activeFilter = filter.value">
          {{ filter.label }} <span>{{ filter.count }}</span>
        </button>
      </div>

      <div class="issue-groups">
        <section v-for="group in groupedIssues" :key="group.category" class="issue-group">
          <header class="issue-group__head">
            <div><h3>{{ group.label }}</h3><p>{{ group.description }}</p></div>
            <span>{{ group.items.length }}건</span>
          </header>

          <div class="issue-cards">
            <article v-for="issue in group.items" :key="issue.id" class="issue-card" :class="`issue-card--${issue.tone}`">
              <div class="issue-card__main">
                <div class="issue-card__meta">
                  <span class="issue-verdict" :class="`issue-verdict--${issue.tone}`">{{ issue.verdict }}</span>
                  <span>{{ issue.evidenceSummary }}</span>
                </div>
                <h4>{{ issue.title }}</h4>
                <p>{{ issue.summary }}</p>
              </div>
              <details class="issue-card__details">
                <summary>근거 및 권장 조치 보기</summary>
                <div class="issue-card__detail-grid">
                  <div><strong>발견 근거</strong><ul><li v-for="evidence in issue.evidence" :key="evidence">{{ evidence }}</li></ul></div>
                  <div><strong>권장 조치</strong><p>{{ issue.recommendation }}</p></div>
                </div>
              </details>
            </article>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.issue-section-head { align-items: flex-start; }
.issue-section-number{margin-right:12px;color:var(--text-4);font-family:var(--font-mono);font-size:var(--fs-meta);font-weight:var(--fw-regular);vertical-align:middle}
.issue-total { color: var(--muted); font-size: 14px; font-weight: 700; vertical-align: middle; }
.issue-overview { display: flex; gap: 8px; }
.issue-overview span { padding: 8px 11px; border: 1px solid var(--line); border-radius: 10px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.issue-overview strong { margin-left: 4px; color: var(--ink); font-size: 14px; }
.issue-filters { display: flex; flex-wrap: wrap; gap: 7px; padding: 18px 24px 0; }
.issue-filters button { padding: 7px 11px; border: 1px solid var(--line); border-radius: 9px; background: #fff; color: var(--muted); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.issue-filters button span { margin-left: 4px; color: var(--ink); }
.issue-filters button.active { border-color: #94a3b8; background: #f1f5f9; color: var(--ink); }
.issue-groups { display: grid; gap: 24px; padding: 22px 24px 26px; }
.issue-group { display: grid; gap: 11px; }
.issue-group__head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.issue-group__head h3 { margin: 0; font-size: 15px; }
.issue-group__head p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
.issue-group__head > span { color: var(--muted); font-size: 12px; }
.issue-cards { display: grid; gap: 10px; }
.issue-card { overflow: hidden; border: 1px solid var(--line); border-left: 3px solid #94a3b8; border-radius: 12px; background: #fff; }
.issue-card--danger { border-left-color: #dc2626; }
.issue-card--warning { border-left-color: #d97706; }
.issue-card__main { padding: 17px 18px 15px; }
.issue-card__meta { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; color: var(--muted); font-size: 11px; }
.issue-verdict { padding: 3px 7px; border-radius: 999px; background: #eef2f6; color: #475569; font-weight: 800; }
.issue-verdict--danger { background: #fef2f2; color: #b42318; }
.issue-verdict--warning { background: #fff7e6; color: #9a6700; }
.issue-card h4 { margin: 0; font-size: 15px; line-height: 1.45; }
.issue-card__main > p { display: -webkit-box; overflow: hidden; margin: 7px 0 0; color: #475569; line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.issue-card__details { border-top: 1px solid #edf0f4; }
.issue-card__details summary { padding: 11px 18px; color: #475569; font-size: 12px; font-weight: 750; cursor: pointer; list-style-position: inside; }
.issue-card__details[open] summary { background: #f8fafc; }
.issue-card__detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 16px 18px 18px; background: #f8fafc; }
.issue-card__detail-grid strong { display: block; margin-bottom: 7px; font-size: 12px; }
.issue-card__detail-grid p, .issue-card__detail-grid ul { margin: 0; color: #526176; font-size: 12px; line-height: 1.65; overflow-wrap: anywhere; }
.issue-card__detail-grid ul { padding-left: 17px; }
.report-section--issues:has(.compact-issues){padding:30px 0!important;border-top:1px solid var(--border)!important}.report-section--issues:has(.compact-issues) .section-head{padding:0!important}.report-section--issues:has(.compact-issues) .issue-overview{gap:16px}.report-section--issues:has(.compact-issues) .issue-overview span{padding:0;border:0;border-radius:0}.report-section--issues:has(.compact-issues) .issue-filters{gap:2px;padding:0 0 12px}.report-section--issues:has(.compact-issues) .issue-filters button{padding:5px 10px;border:0;border-radius:var(--r-pill);background:transparent;color:var(--text-3);font-size:var(--fs-meta);font-weight:var(--fw-regular)}.report-section--issues:has(.compact-issues) .issue-filters button.active{border:1px solid var(--border);background:var(--surface-2);color:var(--ink)}.compact-issues{overflow:hidden;border-radius:var(--r-card);background:var(--surface)}.compact-issues__head,.compact-issue>summary{display:grid;grid-template-columns:100px minmax(0,1fr) 120px;align-items:center;gap:16px}.compact-issues__head{min-height:34px;padding:0 28px;color:var(--text-3);font-size:var(--fs-meta)}.compact-issue{margin:0 12px;border-bottom:1px solid var(--border)}.compact-issue:last-child{border-bottom:0}.compact-issue>summary{min-height:70px;padding:0 16px;cursor:pointer;list-style:none}.compact-issue>summary>strong{font-size:var(--fs-small);font-weight:var(--fw-medium)}.compact-issue>summary>span{display:flex;min-width:0;flex-direction:column}.compact-issue>summary b,.compact-issue>summary small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.compact-issue>summary b{font-size:var(--fs-small);font-weight:var(--fw-medium)}.compact-issue>summary small{color:var(--text-2);font-size:var(--fs-small)}.compact-issue>summary em{overflow:hidden;color:var(--text-4);font-size:var(--fs-meta);font-style:normal;text-overflow:ellipsis;white-space:nowrap}.compact-issue>div{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:0 16px 18px 116px}.compact-issue>div strong{font-size:var(--fs-meta)}.compact-issue>div p,.compact-issue>div ul{margin:5px 0 0;color:var(--text-2);font-size:var(--fs-meta);line-height:1.5}.compact-issue>div ul{padding-left:16px}.compact-issues__more{margin-top:10px;padding:0;border:0;background:none;color:var(--text-3);font-size:var(--fs-small);font-weight:var(--fw-medium);cursor:pointer}

</style>
