<script setup lang="ts">
import { ElMessage } from "element-plus";
import { TEST_ACTION_LABELS } from "../../../../../constants/test-action";
import { formatDateTime, formatDuration } from "../../../../../utils/format";

definePageMeta({ middleware: "project-exists" });

const route = useRoute();
const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const scenarioId = computed(() => String(route.params.scenarioId));
const scenarios = useScenarios(projectId);
const runs = useTestRuns({ scenarioId });
const scenario = shallowRef<TestScenario | null>(null);
const loading = ref(true);
const running = ref(false);
const error = ref<string | null>(null);
const showDelete = ref(false);
const comparisonDialogOpen = ref(false);
const baselineRunId = ref("");
const comparisonRunId = ref("");
const comparing = ref(false);
const comparisonError = ref<string | null>(null);
const comparisonApi = useTestRunComparisons();
const aiAnalysisFlags = reactive<Record<string, boolean>>({});

const completedRuns = computed(() =>
  (runs.data.value ?? []).filter(
    (run) => !["pending", "running"].includes(run.status)
  )
);

onMounted(async () => {
  const [scenarioValue] = await Promise.all([
    scenarios.get(scenarioId.value),
    runs.execute()
  ]);
  scenario.value = scenarioValue;
  error.value = scenarios.error.value ?? runs.error.value;
  loading.value = false;
});

async function execute(): Promise<void> {
  running.value = true;
  const accepted = await runs.create({
    projectId: projectId.value,
    scenarioId: scenarioId.value
  });
  running.value = false;
  if (accepted === null) {
    error.value = runs.error.value;
    return;
  }
  await router.push(
    `/projects/${projectId.value}/scenarios/${scenarioId.value}/runs/${accepted.runId}`
  );
}

async function remove(): Promise<void> {
  const removed = await scenarios.remove(scenarioId.value);
  if (!removed) {
    error.value = scenarios.error.value;
    return;
  }
  ElMessage.success("시나리오를 삭제했습니다.");
  await router.push(`/projects/${projectId.value}`);
}

function openComparison(
  baselineId: string,
  comparisonId: string
): void {
  baselineRunId.value = baselineId;
  comparisonRunId.value = comparisonId;
  comparisonError.value = null;
  comparisonDialogOpen.value = true;
  void loadAiFlags();
}

function compareWithPrevious(run: TestRun): void {
  const index = completedRuns.value.findIndex((item) => item.id === run.id);
  const previous = completedRuns.value[index + 1];
  if (previous === undefined) {
    ElMessage.info("비교할 이전 실행 결과가 없습니다.");
    return;
  }
  openComparison(previous.id, run.id);
}

function selectBaseline(run: TestRun): void {
  const fallbackComparison = completedRuns.value.find(
    (item) => item.id !== run.id
  );
  openComparison(run.id, fallbackComparison?.id ?? "");
}

function selectComparison(run: TestRun): void {
  const runIndex = completedRuns.value.findIndex((item) => item.id === run.id);
  const fallbackBaseline = completedRuns.value
    .slice(runIndex + 1)
    .find((item) => item.id !== run.id);
  openComparison(fallbackBaseline?.id ?? "", run.id);
}

async function startComparison(): Promise<void> {
  if (!baselineRunId.value || !comparisonRunId.value) {
    comparisonError.value = "기준 실행과 비교 실행을 모두 선택해 주세요.";
    return;
  }
  if (baselineRunId.value === comparisonRunId.value) {
    comparisonError.value = "같은 실행을 기준과 비교 대상으로 선택할 수 없습니다.";
    return;
  }
  comparing.value = true;
  comparisonError.value = null;
  const accepted = await comparisonApi.create({
    baselineRunId: baselineRunId.value,
    comparisonRunId: comparisonRunId.value
  });
  comparing.value = false;
  if (accepted === null) {
    comparisonError.value = comparisonApi.error.value;
    return;
  }
  comparisonDialogOpen.value = false;
  await router.push(
    `/projects/${projectId.value}/scenarios/${scenarioId.value}/comparisons/${accepted.comparisonId}`
  );
}

async function loadAiFlags(): Promise<void> {
  await Promise.all(
    completedRuns.value.slice(0, 20).map(async (run) => {
      try {
        const response = await apiFetch<ApiResponse<AiFailureAnalysis | null>>(
          `/api/test-runs/${run.id}/ai-analysis`
        );
        aiAnalysisFlags[run.id] =
          response.success && response.data?.status === "completed";
      } catch {
        aiAnalysisFlags[run.id] = false;
      }
    })
  );
}

function selectedRun(id: string): TestRun | undefined {
  return completedRuns.value.find((run) => run.id === id);
}
</script>

<template>
  <div>
    <div v-if="loading" class="form-panel">
      <el-skeleton :rows="8" animated />
    </div>
    <el-alert
      v-else-if="error || !scenario"
      :title="error || '시나리오를 찾을 수 없습니다.'"
      type="error"
      show-icon
    />
    <template v-else>
      <AppPageHeader
        :title="scenario.name"
        :description="scenario.description || '테스트 시나리오 상세'"
      >
        <el-button type="primary" :loading="running" @click="execute">
          테스트 실행
        </el-button>
        <el-button
          @click="
            router.push(
              `/projects/${projectId}/scenarios/${scenarioId}/edit`
            )
          "
        >
          수정
        </el-button>
        <el-button type="danger" plain @click="showDelete = true">
          삭제
        </el-button>
      </AppPageHeader>

      <section class="info-strip">
        <div>
          <span>시작 URL</span>
          <strong>{{ scenario.startUrl }}</strong>
        </div>
        <div>
          <span>전체 단계</span>
          <strong>{{ scenario.steps.length }}개</strong>
        </div>
        <div>
          <span>Timeout</span>
          <strong>{{ scenario.timeout.toLocaleString() }}ms</strong>
        </div>
        <div>
          <span>수정일</span>
          <strong>{{ formatDateTime(scenario.updatedAt) }}</strong>
        </div>
      </section>

      <section class="content-section">
        <div class="section-heading">
          <div>
            <h2>테스트 단계</h2>
            <p>Playwright가 아래 순서로 실행합니다.</p>
          </div>
        </div>
        <ol class="scenario-step-list">
          <li v-for="step in scenario.steps" :key="step.id">
            <span class="step-number">{{ step.order }}</span>
            <div>
              <strong>{{ step.name }}</strong>
              <span>{{ TEST_ACTION_LABELS[step.action] }}</span>
            </div>
            <code>
              {{
                step.target?.value ||
                step.value ||
                step.expected?.value ||
                "-"
              }}
            </code>
          </li>
        </ol>
      </section>

      <section class="content-section">
        <div class="section-heading">
          <div>
            <h2>실행 이력</h2>
            <p>최근 실행 결과를 선택해 상세 증거를 확인하세요.</p>
          </div>
        </div>
        <AppEmptyState
          v-if="!runs.data.value?.length"
          title="실행 이력이 없습니다"
          description="상단의 테스트 실행 버튼으로 첫 실행을 시작하세요."
        />
        <div v-else class="run-history-list run-history-list--comparison">
          <article
            v-for="run in runs.data.value"
            :key="run.id"
          >
            <div class="run-history-list__summary">
              <AppStatusBadge :status="run.status" />
              <span>{{ formatDateTime(run.createdAt) }}</span>
              <span>{{ formatDuration(run.durationMs) }}</span>
              <strong>{{ run.successCount }}/{{ run.totalSteps }} 성공</strong>
              <small>
                실패 {{ run.failedCount }} · 오류 {{ run.errorCount }}
              </small>
            </div>
            <div class="run-history-list__actions">
              <el-button
                text
                @click="
                  router.push(
                    `/projects/${projectId}/scenarios/${scenarioId}/runs/${run.id}`
                  )
                "
              >
                결과 보기
              </el-button>
              <template v-if="!['pending', 'running'].includes(run.status)">
                <el-button text type="primary" @click="compareWithPrevious(run)">
                  이전 실행과 비교
                </el-button>
                <el-dropdown trigger="click">
                  <el-button text>직접 비교 선택</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item @click="selectBaseline(run)">
                        비교 기준으로 선택
                      </el-dropdown-item>
                      <el-dropdown-item @click="selectComparison(run)">
                        비교 대상으로 선택
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
            </div>
          </article>
        </div>
      </section>
    </template>

    <AppConfirmDialog
      v-model="showDelete"
      title="시나리오 삭제"
      message="관련 실행 이력, 결과 JSON과 스크린샷도 함께 삭제됩니다."
      confirm-label="삭제"
      danger
      @confirm="remove"
    />

    <el-dialog
      v-model="comparisonDialogOpen"
      title="테스트 실행 비교"
      width="min(760px, calc(100vw - 32px))"
      :close-on-click-modal="!comparing"
    >
      <p class="comparison-dialog__intro">
        동일 시나리오의 완료된 실행만 비교할 수 있습니다. 선택 정보는 비교 실패 후에도 유지됩니다.
      </p>
      <el-alert
        v-if="comparisonError"
        :title="comparisonError"
        type="error"
        show-icon
        :closable="false"
        class="page-alert"
      />
      <div class="comparison-selector-grid">
        <label>
          <span>기준 실행</span>
          <el-select v-model="baselineRunId" placeholder="기준 실행 선택">
            <el-option
              v-for="run in completedRuns"
              :key="`baseline-${run.id}`"
              :label="`${formatDateTime(run.createdAt)} · ${run.status}`"
              :value="run.id"
              :disabled="run.id === comparisonRunId"
            />
          </el-select>
        </label>
        <label>
          <span>비교 실행</span>
          <el-select v-model="comparisonRunId" placeholder="비교 실행 선택">
            <el-option
              v-for="run in completedRuns"
              :key="`comparison-${run.id}`"
              :label="`${formatDateTime(run.createdAt)} · ${run.status}`"
              :value="run.id"
              :disabled="run.id === baselineRunId"
            />
          </el-select>
        </label>
      </div>
      <div class="comparison-selection-cards">
        <article v-for="item in [selectedRun(baselineRunId), selectedRun(comparisonRunId)]" :key="item?.id || 'empty'">
          <template v-if="item">
            <code>{{ item.id.slice(0, 18) }}…</code>
            <AppStatusBadge :status="item.status" />
            <span>{{ formatDuration(item.durationMs) }}</span>
            <span>성공 {{ item.successCount }} · 실패 {{ item.failedCount }} · 오류 {{ item.errorCount }}</span>
            <span>시나리오 버전 {{ item.scenarioUpdatedAt ? formatDateTime(item.scenarioUpdatedAt) : "기록 없음" }}</span>
            <span>AI 분석 {{ aiAnalysisFlags[item.id] ? "완료" : "없음" }}</span>
          </template>
          <span v-else>실행을 선택해 주세요.</span>
        </article>
      </div>
      <template #footer>
        <el-button :disabled="comparing" @click="comparisonDialogOpen = false">취소</el-button>
        <el-button type="primary" :loading="comparing" @click="startComparison">비교 시작</el-button>
      </template>
    </el-dialog>
  </div>
</template>
