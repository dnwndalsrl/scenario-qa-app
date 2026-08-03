<script setup lang="ts">
import { ElMessage } from "element-plus";

definePageMeta({ middleware: "project-exists" });

const route = useRoute();
const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const scenarioId = computed(() => String(route.params.scenarioId));
const runId = computed(() => String(route.params.runId));
const polling = useRunPolling(runId);
const runs = useTestRuns();
const retrying = ref(false);
const selectedArtifactId = ref<string | null>(null);
const selectedArtifactTitle = ref("실패 스크린샷");
const screenshotOpen = ref(false);
const logTab = ref("console");
const focusedFromComparison = ref(false);

onMounted(polling.start);

watch(
  () => polling.detail.value?.result,
  async (result) => {
    if (result === undefined || result === null || focusedFromComparison.value) {
      return;
    }
    const order = Number(route.query.focusStep);
    if (!Number.isInteger(order) || order < 1 || order > result.steps.length) {
      return;
    }
    focusedFromComparison.value = true;
    await nextTick();
    const target = document.getElementById(`step-${order}-result`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.classList.add("evidence-highlight");
    window.setTimeout(() => target?.classList.remove("evidence-highlight"), 2600);
  }
);

async function retry(): Promise<void> {
  retrying.value = true;
  const accepted = await runs.retry(runId.value);
  retrying.value = false;
  if (accepted === null) {
    ElMessage.error(runs.error.value ?? "재실행을 요청하지 못했습니다.");
    return;
  }
  ElMessage.success("새 테스트 실행을 시작했습니다.");
  await router.push(
    `/projects/${projectId.value}/scenarios/${scenarioId.value}/runs/${accepted.runId}`
  );
}

function viewScreenshot(artifactId: string, title: string): void {
  selectedArtifactId.value = artifactId;
  selectedArtifactTitle.value = title;
  screenshotOpen.value = true;
}

async function focusEvidence(
  evidenceId: string,
  evidenceType: EvidenceType,
  stepId?: string
): Promise<void> {
  if (evidenceType === "console_error") {
    logTab.value = "console";
  } else if (evidenceType === "network_error") {
    logTab.value = "network";
  }
  let targetId = evidenceId;
  if (stepId !== undefined && polling.detail.value?.result) {
    const index = polling.detail.value.result.steps.findIndex(
      (step) => step.stepId === stepId
    );
    if (index >= 0) {
      targetId = `step-${index + 1}-result`;
    }
  }
  await nextTick();
  const target = document.getElementById(targetId);
  if (target === null) {
    ElMessage.info("연결된 근거 위치를 현재 화면에서 찾을 수 없습니다.");
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("evidence-highlight");
  window.setTimeout(() => target.classList.remove("evidence-highlight"), 2600);
}
</script>

<template>
  <div>
    <AppPageHeader
      title="테스트 실행 결과"
      :description="`실행 ID · ${runId}`"
    >
      <el-button
        @click="
          router.push(
            `/projects/${projectId}/scenarios/${scenarioId}`
          )
        "
      >
        시나리오로 돌아가기
      </el-button>
      <el-button
        v-if="
          polling.detail.value &&
          !polling.isActive.value
        "
        type="primary"
        :loading="retrying"
        @click="retry"
      >
        다시 실행
      </el-button>
    </AppPageHeader>

    <div v-if="polling.loading.value" class="form-panel">
      <el-skeleton :rows="10" animated />
    </div>
    <el-alert
      v-else-if="polling.error.value && !polling.detail.value"
      :title="polling.error.value"
      type="error"
      show-icon
    >
      <template #default>
        <el-button text @click="polling.refresh">다시 시도</el-button>
      </template>
    </el-alert>
    <template v-else-if="polling.detail.value">
      <el-alert
        v-if="polling.error.value"
        :title="polling.error.value"
        type="warning"
        show-icon
        class="page-alert"
      >
        <template #default>
          <el-button text @click="polling.refresh">지금 새로고침</el-button>
        </template>
      </el-alert>

      <div
        v-if="polling.isActive.value"
        class="run-progress-banner"
      >
        <span class="run-progress-banner__spinner" />
        <div>
          <strong>
            {{
              polling.detail.value.run.status === "pending"
                ? "실행 대기 중"
                : "브라우저 테스트 실행 중"
            }}
          </strong>
          <p>
            완료될 때까지 2초 간격으로 자동 갱신합니다.
            화면을 닫아도 실행은 계속됩니다.
          </p>
        </div>
        <small v-if="polling.refreshing.value">상태 확인 중…</small>
      </div>

      <RunSummaryCard
        :run="polling.detail.value.run"
        :result="polling.detail.value.result"
      />

      <section
        v-if="polling.detail.value.result"
        class="result-panel"
      >
        <div class="section-heading">
          <div>
            <h2>단계별 실행 결과</h2>
            <p>단계를 펼쳐 예상 값, 실제 값, URL과 오류를 확인할 수 있습니다.</p>
          </div>
        </div>
        <div class="run-step-list">
          <RunStepResult
            v-for="(step, index) in polling.detail.value.result.steps"
            :key="step.stepId"
            :id="`step-${index + 1}-result`"
            :step="step"
            :index="index"
            @view-screenshot="viewScreenshot"
          />
        </div>
      </section>

      <RunErrorList
        v-if="!polling.isActive.value"
        :run-error="polling.detail.value.run.errorMessage"
        :steps="polling.detail.value.result?.steps ?? []"
      />

      <AiFailureAnalysisPanel
        id="ai-analysis"
        v-if="
          !polling.isActive.value &&
          ['failed', 'error', 'blocked'].includes(
            polling.detail.value.run.status
          )
        "
        :run-id="runId"
        :run-status="polling.detail.value.run.status"
        @select-evidence="focusEvidence"
      />

      <section
        v-if="polling.detail.value.result"
        class="result-panel"
      >
        <el-tabs v-model="logTab">
          <el-tab-pane
            name="console"
            :label="`콘솔 로그 (${polling.detail.value.result.consoleLogs.length})`"
          >
            <AppEmptyState
              v-if="!polling.detail.value.result.consoleLogs.length"
              title="수집된 콘솔 로그가 없습니다"
              description="대상 페이지에서 발생한 로그가 있으면 여기에 표시됩니다."
            />
            <div v-else class="log-viewer">
              <div
                v-for="(log, index) in polling.detail.value.result.consoleLogs"
                :key="`${log.timestamp}-${index}`"
                :id="`console-${index + 1}`"
                class="log-entry"
              >
                <span>{{ log.type }}</span>
                <code>{{ log.text }}</code>
                <time>{{ log.timestamp }}</time>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane
            name="network"
            :label="`네트워크 오류 (${polling.detail.value.result.networkErrors.length})`"
          >
            <AppEmptyState
              v-if="!polling.detail.value.result.networkErrors.length"
              title="수집된 네트워크 오류가 없습니다"
              description="요청 실패나 4xx·5xx 응답이 있으면 여기에 표시됩니다."
            />
            <div v-else class="network-error-list">
              <article
                v-for="(item, index) in polling.detail.value.result.networkErrors"
                :key="`${item.timestamp}-${index}`"
                :id="`network-${index + 1}`"
              >
                <strong>{{ item.method }} · {{ item.status ?? "FAILED" }}</strong>
                <code>{{ item.url }}</code>
                <p>{{ item.failureText || item.resourceType }}</p>
              </article>
            </div>
          </el-tab-pane>
        </el-tabs>
      </section>
    </template>

    <RunScreenshotViewer
      v-model="screenshotOpen"
      :run-id="runId"
      :artifact-id="selectedArtifactId"
      :title="selectedArtifactTitle"
    />
  </div>
</template>
