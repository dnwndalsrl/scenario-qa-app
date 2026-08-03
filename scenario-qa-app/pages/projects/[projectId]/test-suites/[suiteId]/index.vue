<script setup lang="ts">
import { ElMessage } from "element-plus";
import {
  SUITE_POLICY_DESCRIPTIONS,
  SUITE_POLICY_LABELS
} from "../../../../../constants/test-suite";
import { formatDateTime, formatDuration } from "../../../../../utils/format";

definePageMeta({ middleware: "project-exists" });
const route = useRoute();
const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const suiteId = computed(() => String(route.params.suiteId));
const suite = useTestSuite(projectId, suiteId);
const runs = useTestSuiteRuns({ projectId, suiteId });
const runDialogOpen = ref(false);
const requesting = ref(false);

onMounted(async () => {
  await Promise.all([suite.execute(), runs.execute()]);
});

const cannotRunReason = computed(() => {
  const detail = suite.data.value;
  if (detail === null) return "스위트 정보를 불러오지 못했습니다.";
  if (detail.suite.status !== "active") return "비활성 스위트는 실행할 수 없습니다.";
  if (detail.missingScenarioIds.length > 0) return "삭제된 시나리오를 제거한 뒤 실행해 주세요.";
  if (detail.missingEnvironmentVariables.length > 0) return "누락된 환경변수를 설정한 뒤 실행해 주세요.";
  if (!detail.suite.items.some((item) => item.enabled)) return "실행 가능한 시나리오가 없습니다.";
  if ((runs.data.value ?? []).some((run) => ["pending", "running"].includes(run.status))) return "이미 실행 중인 스위트가 있습니다.";
  return null;
});

async function execute(): Promise<void> {
  requesting.value = true;
  const accepted = await runs.create({
    projectId: projectId.value,
    suiteId: suiteId.value
  });
  requesting.value = false;
  if (accepted === null) {
    ElMessage.error(runs.error.value ?? "스위트 실행을 요청하지 못했습니다.");
    return;
  }
  runDialogOpen.value = false;
  await router.push(
    `/projects/${projectId.value}/test-suites/${suiteId.value}/runs/${accepted.suiteRunId}`
  );
}
</script>

<template>
  <div>
    <div v-if="suite.pending.value" class="form-panel"><el-skeleton :rows="8" animated /></div>
    <el-alert v-else-if="suite.error.value || !suite.data.value" :title="suite.error.value || '스위트를 찾을 수 없습니다.'" type="error" show-icon />
    <template v-else>
      <AppPageHeader :title="suite.data.value.suite.name" :description="suite.data.value.suite.description || '테스트 스위트 상세'">
        <el-button type="primary" :disabled="cannotRunReason !== null" @click="runDialogOpen = true">스위트 실행</el-button>
        <el-button @click="router.push(`/projects/${projectId}/test-suites/${suiteId}/edit`)">수정</el-button>
        <el-button @click="router.push(`/projects/${projectId}/test-suites`)">목록</el-button>
      </AppPageHeader>

      <el-alert v-if="cannotRunReason" :title="cannotRunReason" type="warning" show-icon :closable="false" class="page-alert" />
      <el-alert v-if="suite.data.value.missingScenarioIds.length" :title="`삭제된 시나리오: ${suite.data.value.missingScenarioIds.join(', ')}`" type="error" show-icon :closable="false" class="page-alert" />
      <el-alert v-for="missing in suite.data.value.missingEnvironmentVariables" :key="missing.name" :title="`환경변수 ${missing.name} 누락 · 시나리오 ${missing.scenarioIds.join(', ')}`" type="warning" show-icon :closable="false" class="page-alert" />

      <section class="info-strip">
        <div><span>상태</span><strong><AppStatusBadge :status="suite.data.value.suite.status" /></strong></div>
        <div><span>실행 정책</span><strong>{{ SUITE_POLICY_LABELS[suite.data.value.suite.executionPolicy] }}</strong></div>
        <div><span>전체 항목</span><strong>{{ suite.data.value.suite.items.length }}개</strong></div>
        <div><span>최근 실행</span><strong>{{ formatDateTime(suite.data.value.recentRun?.createdAt) }}</strong></div>
      </section>

      <section class="content-section">
        <div class="section-heading"><div><h2>실행 순서</h2><p>{{ SUITE_POLICY_DESCRIPTIONS[suite.data.value.suite.executionPolicy] }}</p></div></div>
        <ol class="suite-order-list">
          <li v-for="item in suite.data.value.items" :key="item.id" :class="{ 'suite-order-list__invalid': !item.scenarioExists }">
            <span class="step-number">{{ item.order }}</span>
            <div><strong>{{ item.scenarioName || '삭제된 시나리오' }}</strong><small>{{ item.scenarioId }}</small></div>
            <span>{{ item.enabled ? '실행' : '건너뜀' }}</span>
            <span>{{ item.required ? '필수' : '선택' }}</span>
          </li>
        </ol>
      </section>

      <section class="content-section">
        <div class="section-heading"><div><h2>실행 이력</h2><p>스냅샷 기준 과거 결과를 확인합니다.</p></div></div>
        <AppEmptyState v-if="!runs.data.value?.length" title="스위트 실행 이력이 없습니다" description="상단 실행 버튼으로 첫 순차 실행을 시작하세요." />
        <div v-else class="run-history-list">
          <article v-for="run in runs.data.value" :key="run.id">
            <AppStatusBadge :status="run.status" />
            <span>{{ formatDateTime(run.createdAt) }}</span>
            <span>{{ formatDuration(run.durationMs) }}</span>
            <strong>{{ run.successCount }}/{{ run.executableItems }} 성공</strong>
            <el-button text type="primary" @click="router.push(`/projects/${projectId}/test-suites/${suiteId}/runs/${run.id}`)">상세 보기</el-button>
          </article>
        </div>
      </section>
    </template>

    <el-dialog v-model="runDialogOpen" title="테스트 스위트 실행 확인" width="min(680px, calc(100vw - 32px))" :close-on-click-modal="!requesting">
      <template v-if="suite.data.value">
        <el-alert :title="SUITE_POLICY_DESCRIPTIONS[suite.data.value.suite.executionPolicy]" type="info" show-icon :closable="false" />
        <ol class="suite-confirm-list">
          <li v-for="item in suite.data.value.items" :key="item.id">
            <span>{{ item.order }}</span><strong>{{ item.scenarioName || item.scenarioId }}</strong><small>{{ item.enabled ? '실행' : '건너뜀' }}</small>
          </li>
        </ol>
        <p class="confirm-dialog__message">각 시나리오는 독립된 브라우저 컨텍스트에서 순차 실행됩니다.</p>
      </template>
      <template #footer>
        <el-button :disabled="requesting" @click="runDialogOpen = false">취소</el-button>
        <el-button type="primary" :loading="requesting" @click="execute">실행 시작</el-button>
      </template>
    </el-dialog>
  </div>
</template>
