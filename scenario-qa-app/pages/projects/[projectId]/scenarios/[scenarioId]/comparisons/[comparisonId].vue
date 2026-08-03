<script setup lang="ts">
import { ElMessage } from "element-plus";
import { formatDateTime, formatDuration, formatJsonValue } from "../../../../../../utils/format";

definePageMeta({ middleware: "project-exists" });

type StepFilter =
  | "all"
  | "regression"
  | "resolved"
  | "persistent_failure"
  | "unchanged_success"
  | "added"
  | "removed"
  | "degraded";

const route = useRoute();
const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const scenarioId = computed(() => String(route.params.scenarioId));
const comparisonId = computed(() => String(route.params.comparisonId));
const polling = useComparisonPolling(comparisonId);
const comparisonApi = useTestRunComparisons();
const scenarioApi = useScenarios(projectId);
const scenario = shallowRef<TestScenario | null>(null);
const selectedFilter = ref<StepFilter>("all");
const filterInitialized = ref(false);
const rerunning = ref(false);

const changeLabels: Record<RunChangeType | StepChangeType, string> = {
  regression: "신규 회귀",
  resolved: "해결됨",
  persistent_failure: "지속 실패",
  unchanged_success: "정상 유지",
  status_changed: "상태 변경",
  structural_change: "구조 변경",
  added: "추가된 단계",
  removed: "삭제된 단계"
};

const matchLabels: Record<StepMatchType, string> = {
  step_id: "동일 단계 ID",
  order_action: "순서와 액션",
  name_action: "이름과 액션",
  target_action: "대상과 액션",
  unmatched: "매칭되지 않음"
};

const performanceLabels: Record<PerformanceChange, string> = {
  improved: "개선",
  stable: "안정",
  degraded: "저하",
  critical_degraded: "심각한 저하"
};

const filters: { value: StepFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "regression", label: "신규 회귀" },
  { value: "resolved", label: "해결됨" },
  { value: "persistent_failure", label: "지속 실패" },
  { value: "unchanged_success", label: "정상 유지" },
  { value: "added", label: "추가된 단계" },
  { value: "removed", label: "삭제된 단계" },
  { value: "degraded", label: "성능 저하" }
];

const completed = computed(
  () => polling.comparison.value?.status === "completed"
);
const steps = computed(
  () => polling.comparison.value?.stepComparisons ?? []
);
const filteredSteps = computed(() => {
  if (selectedFilter.value === "all") return steps.value;
  if (selectedFilter.value === "degraded") {
    return steps.value.filter(
      (step) =>
        step.performanceChange === "degraded" ||
        step.performanceChange === "critical_degraded"
    );
  }
  return steps.value.filter(
    (step) => step.changeType === selectedFilter.value
  );
});
const hasStructuralChange = computed(() =>
  steps.value.some(
    (step) => step.changeType === "added" || step.changeType === "removed"
  )
);
const consoleGroups = computed(() => ({
  new: polling.comparison.value?.consoleComparisons?.filter((item) => item.changeType === "new") ?? [],
  persistent: polling.comparison.value?.consoleComparisons?.filter((item) => item.changeType === "persistent") ?? [],
  resolved: polling.comparison.value?.consoleComparisons?.filter((item) => item.changeType === "resolved") ?? []
}));

watch(
  () => polling.comparison.value?.summary,
  (summary) => {
    if (summary === undefined || filterInitialized.value) return;
    selectedFilter.value = summary.regressionCount > 0 ? "regression" : "all";
    filterInitialized.value = true;
  }
);

onMounted(async () => {
  polling.start();
  scenario.value = await scenarioApi.get(scenarioId.value);
});

async function compareAgain(): Promise<void> {
  const current = polling.comparison.value;
  if (current === null) return;
  rerunning.value = true;
  const accepted = await comparisonApi.create({
    baselineRunId: current.baselineRunId,
    comparisonRunId: current.comparisonRunId
  });
  rerunning.value = false;
  if (accepted === null) {
    ElMessage.error(comparisonApi.error.value ?? "비교를 요청하지 못했습니다.");
    return;
  }
  if (accepted.comparisonId === current.id) {
    ElMessage.info("동일한 비교 결과를 재사용했습니다.");
    await polling.refresh();
    return;
  }
  await router.replace(
    `/projects/${projectId.value}/scenarios/${scenarioId.value}/comparisons/${accepted.comparisonId}`
  );
}

function runResultUrl(runId: string, order?: number): string {
  const base = `/projects/${projectId.value}/scenarios/${scenarioId.value}/runs/${runId}`;
  return order === undefined ? base : `${base}?focusStep=${order}`;
}

function signedDuration(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${value > 0 ? "+" : ""}${formatDuration(value)}`;
}

function percent(value: number | undefined): string {
  if (value === undefined) return "변화율 계산 불가";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function displayValue(value: JsonValue | undefined): string {
  return value === undefined
    ? "-"
    : formatJsonValue(value).replaceAll("[REDACTED]", "••••••••");
}

function statusTitle(comparison: TestRunComparison): string {
  const label = comparison.runChangeType
    ? changeLabels[comparison.runChangeType]
    : "상태 확인 중";
  if (comparison.runChangeType === "regression") return `${label}가 감지되었습니다.`;
  if (comparison.runChangeType === "resolved") return "이전 실패가 해결되었습니다.";
  if ((comparison.summary?.regressionCount ?? 0) === 0) return "새롭게 발생한 실패는 발견되지 않았습니다.";
  return label;
}
</script>

<template>
  <div>
    <AppPageHeader
      :title="scenario?.name || '테스트 실행 비교'"
      description="두 테스트 실행의 상태, 로그 및 실행 시간을 비교한 결과입니다."
    >
      <el-button
        @click="router.push(`/projects/${projectId}/scenarios/${scenarioId}`)"
      >
        실행 이력으로
      </el-button>
      <el-button
        v-if="polling.comparison.value"
        type="primary"
        plain
        :loading="rerunning"
        @click="compareAgain"
      >
        다시 비교
      </el-button>
    </AppPageHeader>

    <el-alert
      title="이 결과는 두 테스트 실행의 상태, 로그 및 실행 시간을 비교한 결과입니다. 시나리오가 수정된 경우 일부 단계는 정확히 매칭되지 않을 수 있습니다."
      type="info"
      show-icon
      :closable="false"
      class="page-alert"
    />

    <div v-if="polling.loading.value" class="form-panel">
      <el-skeleton :rows="12" animated />
    </div>
    <el-alert
      v-else-if="polling.error.value && !polling.comparison.value"
      :title="polling.error.value"
      type="error"
      show-icon
    >
      <template #default>
        <el-button text @click="polling.refresh">다시 시도</el-button>
      </template>
    </el-alert>

    <template v-else-if="polling.comparison.value">
      <section class="comparison-run-header">
        <div>
          <span>기준 실행</span>
          <strong>{{ formatDateTime(polling.comparison.value.baselineCreatedAt) }}</strong>
          <code>{{ polling.comparison.value.baselineRunId }}</code>
          <el-button
            text
            type="primary"
            @click="router.push(runResultUrl(polling.comparison.value!.baselineRunId))"
          >기준 실행 상세 보기</el-button>
        </div>
        <span class="comparison-run-header__arrow">→</span>
        <div>
          <span>비교 실행</span>
          <strong>{{ formatDateTime(polling.comparison.value.comparisonCreatedAt) }}</strong>
          <code>{{ polling.comparison.value.comparisonRunId }}</code>
          <el-button
            text
            type="primary"
            @click="router.push(runResultUrl(polling.comparison.value!.comparisonRunId))"
          >비교 실행 상세 보기</el-button>
        </div>
        <el-tag :type="completed ? 'success' : polling.comparison.value.status === 'failed' ? 'danger' : 'warning'">
          {{ polling.comparison.value.status }}
        </el-tag>
      </section>

      <div v-if="polling.isActive.value" class="run-progress-banner">
        <span class="run-progress-banner__spinner" />
        <div>
          <strong>실행 결과 비교 중</strong>
          <p>단계, 성능, 콘솔 및 네트워크 변화를 계산하고 있습니다.</p>
        </div>
        <small v-if="polling.refreshing.value">상태 확인 중…</small>
      </div>

      <el-alert
        v-if="polling.comparison.value.status === 'failed'"
        :title="polling.comparison.value.errorMessage || '비교 처리에 실패했습니다.'"
        type="error"
        show-icon
        :closable="false"
      />

      <template v-if="completed && polling.comparison.value.summary">
        <section
          class="comparison-change-banner"
          :class="`comparison-change-banner--${polling.comparison.value.runChangeType}`"
        >
          <div>
            <span>전체 상태 변화</span>
            <strong>
              {{ polling.comparison.value.baselineRunStatus }}
              →
              {{ polling.comparison.value.comparisonRunStatus }}
            </strong>
          </div>
          <h2>{{ statusTitle(polling.comparison.value) }}</h2>
        </section>

        <el-alert
          v-if="hasStructuralChange"
          title="비교 대상 실행 사이에 테스트 단계가 변경되었습니다. 추가되거나 삭제된 단계를 별도로 확인해 주세요."
          type="warning"
          show-icon
          :closable="false"
          class="page-alert"
        />

        <section class="comparison-summary-grid">
          <article><span>신규 회귀</span><strong>{{ polling.comparison.value.summary.regressionCount }}</strong></article>
          <article><span>해결됨</span><strong>{{ polling.comparison.value.summary.resolvedCount }}</strong></article>
          <article><span>지속 실패</span><strong>{{ polling.comparison.value.summary.persistentFailureCount }}</strong></article>
          <article><span>정상 유지</span><strong>{{ polling.comparison.value.summary.unchangedSuccessCount }}</strong></article>
          <article><span>추가된 단계</span><strong>{{ polling.comparison.value.summary.addedSteps }}</strong></article>
          <article><span>삭제된 단계</span><strong>{{ polling.comparison.value.summary.removedSteps }}</strong></article>
          <article><span>신규 콘솔 오류</span><strong>{{ polling.comparison.value.summary.newConsoleErrorCount }}</strong></article>
          <article><span>신규 네트워크 오류</span><strong>{{ polling.comparison.value.summary.newNetworkErrorCount }}</strong></article>
          <article><span>성능 저하 단계</span><strong>{{ polling.comparison.value.summary.degradedStepCount }}</strong></article>
          <article><span>전체 시간 변화</span><strong>{{ signedDuration(polling.comparison.value.summary.overallDurationDifferenceMs) }}</strong></article>
        </section>

        <section v-if="polling.comparison.value.performanceComparison" class="result-panel comparison-performance">
          <div class="section-heading">
            <div><h2>성능 비교</h2><p>작은 시간 차이를 제외하고 변화율과 절대 증가량을 함께 적용합니다.</p></div>
          </div>
          <div class="comparison-performance__values">
            <div><span>기준 실행</span><strong>{{ formatDuration(polling.comparison.value.performanceComparison.baselineDurationMs) }}</strong></div>
            <div><span>비교 실행</span><strong>{{ formatDuration(polling.comparison.value.performanceComparison.comparisonDurationMs) }}</strong></div>
            <div><span>변화</span><strong>{{ signedDuration(polling.comparison.value.performanceComparison.differenceMs) }} · {{ percent(polling.comparison.value.performanceComparison.changeRate) }}</strong></div>
            <el-tag :type="polling.comparison.value.performanceComparison.change.includes('degraded') ? 'danger' : polling.comparison.value.performanceComparison.change === 'improved' ? 'success' : 'info'">
              {{ performanceLabels[polling.comparison.value.performanceComparison.change] }}
            </el-tag>
          </div>
          <small>
            저하: {{ (polling.comparison.value.performanceComparison.warningRate * 100).toFixed(0) }}% 이상이며 {{ polling.comparison.value.performanceComparison.minimumDifferenceMs }}ms 이상 ·
            심각: {{ (polling.comparison.value.performanceComparison.criticalRate * 100).toFixed(0) }}% 이상이며 {{ polling.comparison.value.performanceComparison.criticalDifferenceMs }}ms 이상
          </small>
        </section>

        <section class="result-panel">
          <div class="section-heading">
            <div><h2>단계 비교</h2><p>변경 유형을 선택하고 각 단계의 매칭 근거와 값 변화를 확인하세요.</p></div>
          </div>
          <div class="comparison-filter-list" role="group" aria-label="단계 변경 유형 필터">
            <el-button
              v-for="filter in filters"
              :key="filter.value"
              :type="selectedFilter === filter.value ? 'primary' : 'default'"
              :plain="selectedFilter !== filter.value"
              @click="selectedFilter = filter.value"
            >{{ filter.label }}</el-button>
          </div>
          <AppEmptyState
            v-if="!filteredSteps.length"
            title="해당 변경 유형의 단계가 없습니다"
            description="다른 필터를 선택해 전체 비교 결과를 확인해 주세요."
          />
          <div v-else class="comparison-step-list">
            <details v-for="step in filteredSteps" :key="step.id" :open="step.changeType === 'regression'">
              <summary>
                <span>{{ step.comparisonOrder ?? step.baselineOrder }}</span>
                <strong>{{ step.baselineName || '-' }} → {{ step.comparisonName || '-' }}</strong>
                <code>{{ step.comparisonAction || step.baselineAction }}</code>
                <span>{{ step.baselineStatus || '-' }} → {{ step.comparisonStatus || '-' }}</span>
                <el-tag :type="step.changeType === 'regression' ? 'danger' : step.changeType === 'resolved' ? 'success' : 'info'">
                  {{ changeLabels[step.changeType] }}
                </el-tag>
                <small>{{ signedDuration(step.durationDifferenceMs) }}</small>
              </summary>
              <div class="comparison-step-detail">
                <dl>
                  <div><dt>매칭 방식</dt><dd>{{ matchLabels[step.matchType] }}</dd></div>
                  <div><dt>매칭 신뢰도</dt><dd>{{ (step.matchConfidence * 100).toFixed(0) }}%</dd></div>
                  <div><dt>성능 변화</dt><dd>{{ step.performanceChange ? performanceLabels[step.performanceChange] : '-' }}</dd></div>
                  <div><dt>스크린샷</dt><dd>기준 {{ step.baselineScreenshotAvailable ? '있음' : '없음' }} · 비교 {{ step.comparisonScreenshotAvailable ? '있음' : '없음' }}</dd></div>
                </dl>
                <div class="comparison-detail-flags">
                  <el-tag :type="step.targetChanged ? 'warning' : 'info'">대상 {{ step.targetChanged ? '변경' : '동일' }}</el-tag>
                  <el-tag :type="step.expectedChanged ? 'warning' : 'info'">기대 결과 {{ step.expectedChanged ? '변경' : '동일' }}</el-tag>
                  <el-tag :type="step.actualChanged ? 'warning' : 'info'">실제 결과 {{ step.actualChanged ? '변경' : '동일' }}</el-tag>
                  <el-tag :type="step.urlChanged ? 'warning' : 'info'">URL {{ step.urlChanged ? '변경' : '동일' }}</el-tag>
                  <el-tag :type="step.errorMessageChanged ? 'warning' : 'info'">오류 {{ step.errorMessageChanged ? '변경' : '동일' }}</el-tag>
                </div>
                <div v-for="detail in step.details.filter((item) => item.changed)" :key="detail.field" class="comparison-value-diff">
                  <strong>{{ detail.label }}</strong>
                  <pre>{{ displayValue(detail.baselineValue) }}</pre>
                  <span>→</span>
                  <pre>{{ displayValue(detail.comparisonValue) }}</pre>
                </div>
                <div class="comparison-step-links">
                  <el-button v-if="step.baselineStepId" text type="primary" @click="router.push(runResultUrl(polling.comparison.value!.baselineRunId, step.baselineOrder))">기준 실행에서 보기</el-button>
                  <el-button v-if="step.comparisonStepId" text type="primary" @click="router.push(runResultUrl(polling.comparison.value!.comparisonRunId, step.comparisonOrder))">비교 실행에서 보기</el-button>
                </div>
              </div>
            </details>
          </div>
        </section>

        <section v-if="hasStructuralChange" class="result-panel">
          <div class="section-heading"><div><h2>구조 변경</h2><p>매칭되지 않은 추가·삭제 단계를 분리했습니다.</p></div></div>
          <div class="comparison-structure-grid">
            <div><h3>추가된 단계</h3><p v-for="step in steps.filter((item) => item.changeType === 'added')" :key="step.id">{{ step.comparisonOrder }}. {{ step.comparisonName }}</p><span v-if="!steps.some((item) => item.changeType === 'added')">없음</span></div>
            <div><h3>삭제된 단계</h3><p v-for="step in steps.filter((item) => item.changeType === 'removed')" :key="step.id">{{ step.baselineOrder }}. {{ step.baselineName }}</p><span v-if="!steps.some((item) => item.changeType === 'removed')">없음</span></div>
          </div>
        </section>

        <section class="result-panel">
          <div class="section-heading"><div><h2>콘솔 오류 비교</h2><p>동적 값과 민감정보를 제거한 fingerprint 기준입니다.</p></div></div>
          <el-tabs>
            <el-tab-pane :label="`새로 발생 (${consoleGroups.new.length})`">
              <AppEmptyState v-if="!consoleGroups.new.length" title="새 콘솔 오류가 없습니다" description="비교 실행에서 새롭게 발생한 오류가 없습니다." />
              <div v-else class="comparison-log-list"><article v-for="item in consoleGroups.new" :key="item.fingerprint"><el-tag type="danger">새로 발생</el-tag><strong>{{ item.type }}</strong><code>{{ item.comparisonMessage }}</code><span>기준 {{ item.baselineCount }}회 · 비교 {{ item.comparisonCount }}회</span></article></div>
            </el-tab-pane>
            <el-tab-pane :label="`지속 발생 (${consoleGroups.persistent.length})`">
              <AppEmptyState v-if="!consoleGroups.persistent.length" title="지속 콘솔 오류가 없습니다" description="두 실행에 공통으로 발생한 오류가 없습니다." />
              <div v-else class="comparison-log-list"><article v-for="item in consoleGroups.persistent" :key="item.fingerprint"><el-tag type="warning">지속 발생</el-tag><strong>{{ item.type }}</strong><code>{{ item.comparisonMessage }}</code><span>기준 {{ item.baselineCount }}회 · 비교 {{ item.comparisonCount }}회</span></article></div>
            </el-tab-pane>
            <el-tab-pane :label="`해결됨 (${consoleGroups.resolved.length})`">
              <AppEmptyState v-if="!consoleGroups.resolved.length" title="해결된 콘솔 오류가 없습니다" description="기준 실행에만 있던 오류가 없습니다." />
              <div v-else class="comparison-log-list"><article v-for="item in consoleGroups.resolved" :key="item.fingerprint"><el-tag type="success">해결됨</el-tag><strong>{{ item.type }}</strong><code>{{ item.baselineMessage }}</code><span>기준 {{ item.baselineCount }}회 · 비교 {{ item.comparisonCount }}회</span></article></div>
            </el-tab-pane>
          </el-tabs>
        </section>

        <section class="result-panel">
          <div class="section-heading"><div><h2>네트워크 오류 비교</h2><p>method, 정제된 URL, status, resource type과 failure text를 비교합니다.</p></div></div>
          <AppEmptyState v-if="!polling.comparison.value.networkComparisons?.length" title="비교할 네트워크 오류가 없습니다" description="두 실행에서 수집된 네트워크 오류가 없습니다." />
          <div v-else class="comparison-network-list">
            <article v-for="item in polling.comparison.value.networkComparisons" :key="`${item.fingerprint}-${item.changeType}`" :class="`comparison-network-list--${item.changeType}`">
              <div><strong>{{ item.method }}</strong><code>{{ item.normalizedUrl }}</code></div>
              <span>{{ item.baselineStatus ?? 'FAILED' }} → {{ item.comparisonStatus ?? 'FAILED' }}</span>
              <span>{{ item.resourceType }}</span>
              <p>{{ item.failureText || '응답 상태 변화' }}</p>
              <el-tag :type="item.changeType === 'new' || item.changeType === 'status_changed' ? 'danger' : item.changeType === 'resolved' ? 'success' : 'warning'">{{ item.changeType }}</el-tag>
            </article>
          </div>
        </section>

        <section v-if="polling.comparison.value.limitations?.length" class="result-panel comparison-limitations">
          <div class="section-heading"><div><h2>비교 한계</h2><p>결과를 해석할 때 함께 확인해 주세요.</p></div></div>
          <ul><li v-for="item in polling.comparison.value.limitations" :key="item">{{ item }}</li></ul>
        </section>
      </template>
    </template>
  </div>
</template>
