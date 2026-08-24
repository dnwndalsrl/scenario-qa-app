<script setup lang="ts">
import type { AutomatedTestRun, GeneratedTestScenario, TestSuite } from "~/shared/types/analysis";
import { latestTestSuiteRunSummary } from "~/shared/utils/test-suite-summary";

const props = withDefaults(defineProps<{
  analysisId: string;
  tests: GeneratedTestScenario[];
  runs?: AutomatedTestRun[];
  canRun?: boolean;
}>(), { runs: () => [], canRun: false });
const emit = defineEmits<{ changed: [] }>();
const { $api } = useNuxtApp();
const apiRequest = $api as <T>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>;
const suites = ref<TestSuite[]>([]);
const selectedIds = ref<string[]>([]);
const suiteName = ref("");
const composing = ref(false);
const loading = ref(true);
const saving = ref(false);
const busySuiteId = ref("");
const activeRunIds = ref<string[]>([]);
const feedback = ref("");
const feedbackError = ref(false);
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshDeadline = 0;

const executableTests = computed(() => props.tests.filter((test) => test.safetyLevel === "safe" && test.autoExecutable));
const allSelected = computed(() => executableTests.value.length > 0 && selectedIds.value.length === executableTests.value.length);
const suiteItems = computed(() => suites.value.map((suite) => ({ suite, summary: latestTestSuiteRunSummary(suite.id, props.runs) })));

function errorMessage(cause: any, fallback: string) {
  return cause?.data?.statusMessage || cause?.data?.message || cause?.message || fallback;
}
function suiteTestTitles(suite: TestSuite) {
  const titles = suite.testIds.map((id) => props.tests.find((test) => test.id === id)?.title).filter(Boolean) as string[];
  return titles.length ? titles.join(" · ") : "저장된 시나리오를 확인할 수 없습니다.";
}
function summaryStatus(status: "running" | "success" | "failed" | "error") {
  return { running: "실행 중", success: "성공", failed: "실패", error: "오류" }[status];
}
function formatDate(value?: string) {
  if (!value) return "기록 중";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function formatDuration(value?: number) {
  if (value === undefined) return "계산 중";
  if (value < 60_000) return `${Math.max(1, Math.round(value / 1000))}초`;
  return `${Math.floor(value / 60_000)}분 ${Math.round((value % 60_000) / 1000)}초`;
}
function toggleAll() {
  selectedIds.value = allSelected.value ? [] : executableTests.value.map((test) => test.id);
}
async function loadSuites() {
  loading.value = true;
  try {
    const result = await apiRequest<{ suites: TestSuite[] }>(`/api/analyses/${props.analysisId}/suites`);
    suites.value = result.suites;
  } catch (cause) {
    feedbackError.value = true;
    feedback.value = errorMessage(cause, "테스트 스위트를 불러오지 못했습니다.");
  } finally { loading.value = false; }
}
async function saveSuite() {
  saving.value = true;
  feedback.value = "";
  try {
    await apiRequest<void>(`/api/analyses/${props.analysisId}/suites`, { method: "POST", body: { name: suiteName.value, testIds: selectedIds.value } });
    suiteName.value = "";
    selectedIds.value = [];
    composing.value = false;
    feedbackError.value = false;
    feedback.value = "테스트 스위트를 저장했습니다.";
    await loadSuites();
  } catch (cause) {
    feedbackError.value = true;
    feedback.value = errorMessage(cause, "테스트 스위트 저장에 실패했습니다.");
  } finally { saving.value = false; }
}
async function runSuite(suite: TestSuite) {
  busySuiteId.value = suite.id;
  feedback.value = "";
  try {
    const result = await apiRequest<{ runIds: string[]; failedCount?: number }>(`/api/analyses/${props.analysisId}/suites/${suite.id}/runs`, { method: "POST" });
    activeRunIds.value = result.runIds;
    refreshDeadline = Date.now() + 10 * 60 * 1000;
    feedbackError.value = Boolean(result.failedCount);
    feedback.value = result.failedCount
      ? `‘${suite.name}’ 중 ${result.failedCount}개 테스트 요청에 실패했습니다. 나머지 테스트는 실행합니다.`
      : `‘${suite.name}’ 스위트를 실행 대기열에 등록했습니다.`;
    emit("changed");
    scheduleRefresh();
  } catch (cause) {
    feedbackError.value = true;
    feedback.value = errorMessage(cause, "테스트 스위트 실행 요청에 실패했습니다.");
  } finally { busySuiteId.value = ""; }
}
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (!activeRunIds.value.length || Date.now() >= refreshDeadline) return;
  refreshTimer = setTimeout(() => { emit("changed"); scheduleRefresh(); }, 2500);
}
function stopRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = undefined;
  activeRunIds.value = [];
}
watch(() => props.runs.map((run) => `${run.id}:${run.status}`).join("|"), () => {
  if (!activeRunIds.value.length) return;
  const activeRuns = activeRunIds.value.map((id) => props.runs.find((run) => run.id === id));
  if (activeRuns.every((run) => run && !["pending", "running"].includes(run.status))) stopRefresh();
});
onMounted(loadSuites);
onBeforeUnmount(stopRefresh);
</script>

<template>
  <div class="suite-panel">
    <div class="suite-panel__head">
      <div><h3>테스트 스위트</h3><p>자주 확인할 안전한 시나리오를 묶어 한 번에 실행합니다.</p></div>
      <button type="button" class="scenario-button" :disabled="!executableTests.length" @click="composing = !composing">{{ composing ? '구성 닫기' : '새 스위트 구성' }}</button>
    </div>
    <div v-if="feedback" :class="feedbackError ? 'error-box' : 'notice'">{{ feedback }}</div>
    <div v-if="loading" class="suite-panel__empty">스위트를 불러오는 중입니다.</div>
    <div v-else-if="suiteItems.length" class="suite-list">
      <article v-for="item in suiteItems" :key="item.suite.id" class="suite-item">
        <div class="suite-item__main">
          <div><div class="suite-item__title"><strong>{{ item.suite.name }}</strong><span>{{ item.suite.testIds.length }}개 시나리오</span></div><p>{{ suiteTestTitles(item.suite) }}</p></div>
          <button type="button" class="scenario-button scenario-button--primary" :disabled="!canRun || Boolean(busySuiteId) || Boolean(activeRunIds.length)" @click="runSuite(item.suite)">{{ busySuiteId === item.suite.id ? '요청 중…' : activeRunIds.length ? '실행 중…' : '일괄 실행' }}</button>
        </div>
        <div v-if="item.summary" class="suite-summary">
          <span class="suite-summary__status" :class="`suite-summary__status--${item.summary.status}`">{{ summaryStatus(item.summary.status) }}</span>
          <dl class="suite-summary__metrics">
            <div><dt>전체</dt><dd>{{ item.summary.totalCount }}</dd></div>
            <div><dt>성공</dt><dd>{{ item.summary.successCount }}</dd></div>
            <div><dt>실패</dt><dd>{{ item.summary.failedCount }}</dd></div>
            <div><dt>오류·차단</dt><dd>{{ item.summary.errorCount }}</dd></div>
          </dl>
          <p class="suite-summary__meta">최근 실행 {{ formatDate(item.summary.completedAt || item.summary.startedAt) }} · 소요 {{ formatDuration(item.summary.durationMs) }}</p>
        </div>
        <p v-else class="suite-summary__empty">아직 스위트 실행 이력이 없습니다.</p>
      </article>
    </div>
    <div v-else-if="!composing" class="suite-panel__empty">저장한 테스트 스위트가 없습니다.</div>
    <p v-if="suites.length && !canRun" class="suite-panel__hint">스위트 일괄 실행은 3단계 최종 보고서가 완성된 뒤 사용할 수 있습니다.</p>

    <form v-if="composing" class="suite-composer" @submit.prevent="saveSuite">
      <div class="suite-composer__controls"><label>스위트 이름<input v-model="suiteName" required maxlength="80" placeholder="예: 배포 전 핵심 회귀 테스트"></label><button type="button" class="scenario-button" @click="toggleAll">{{ allSelected ? '전체 해제' : '전체 선택' }}</button></div>
      <div class="suite-checklist">
        <label v-for="test in executableTests" :key="test.id"><input v-model="selectedIds" type="checkbox" :value="test.id"><span><strong>{{ test.title }}</strong><small>{{ test.purpose }}</small></span></label>
      </div>
      <div class="scenario-actions"><span>{{ selectedIds.length }}개 선택</span><span class="scenario-spacer"/><button type="button" class="scenario-button" @click="composing = false">취소</button><button type="submit" class="scenario-button scenario-button--primary" :disabled="saving || !suiteName.trim() || !selectedIds.length">{{ saving ? '저장 중…' : '스위트 저장' }}</button></div>
    </form>
  </div>
</template>
