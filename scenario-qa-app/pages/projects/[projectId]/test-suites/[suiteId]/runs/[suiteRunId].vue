<script setup lang="ts">
import { SUITE_POLICY_LABELS } from "../../../../../../constants/test-suite";
import { formatDateTime, formatDuration } from "../../../../../../utils/format";

definePageMeta({ middleware: "project-exists" });
const route = useRoute();
const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const suiteId = computed(() => String(route.params.suiteId));
const suiteRunId = computed(() => String(route.params.suiteRunId));
const polling = useTestSuiteRunPolling(suiteRunId);

onMounted(polling.start);

const currentItem = computed(() => {
  const detail = polling.detail.value;
  if (detail === null || detail.run.status !== "running") return null;
  return detail.items.find(
    (item) => item.order === detail.run.currentItemOrder
  ) ?? null;
});

function resultPath(item: TestSuiteRunItem): string {
  return `/projects/${projectId.value}/scenarios/${item.scenarioId}/runs/${item.testRunId ?? ''}`;
}
</script>

<template>
  <div>
    <AppPageHeader title="스위트 실행 결과" description="순차 실행 진행률과 시나리오별 실제 Playwright 결과입니다.">
      <el-button :loading="polling.refreshing.value" @click="polling.refresh">새로고침</el-button>
      <el-button @click="router.push(`/projects/${projectId}/test-suites/${suiteId}`)">스위트로 돌아가기</el-button>
    </AppPageHeader>
    <div v-if="polling.loading.value" class="form-panel"><el-skeleton :rows="10" animated /></div>
    <el-alert v-else-if="polling.error.value && !polling.detail.value" :title="polling.error.value" type="error" show-icon />
    <template v-else-if="polling.detail.value">
      <el-alert v-if="polling.error.value" :title="polling.error.value" type="warning" show-icon class="page-alert" />
      <section class="suite-run-hero">
        <div class="suite-run-hero__heading">
          <div>
            <AppStatusBadge :status="polling.detail.value.run.status" />
            <h2>{{ polling.detail.value.run.suiteSnapshot.suiteName }}</h2>
            <p>{{ SUITE_POLICY_LABELS[polling.detail.value.run.executionPolicy] }}</p>
          </div>
          <strong>{{ polling.detail.value.run.progressRate }}%</strong>
        </div>
        <el-progress :percentage="polling.detail.value.run.progressRate" :status="polling.detail.value.run.status === 'success' ? 'success' : polling.detail.value.run.status === 'failed' || polling.detail.value.run.status === 'error' ? 'exception' : undefined" />
        <p v-if="currentItem" class="suite-current-item">현재 실행 중: {{ currentItem.order }}. {{ currentItem.scenarioName }}</p>
        <dl class="suite-run-metrics">
          <div><dt>성공</dt><dd>{{ polling.detail.value.run.successCount }}</dd></div>
          <div><dt>실패</dt><dd>{{ polling.detail.value.run.failedCount }}</dd></div>
          <div><dt>중단</dt><dd>{{ polling.detail.value.run.blockedCount }}</dd></div>
          <div><dt>건너뜀</dt><dd>{{ polling.detail.value.run.skippedCount }}</dd></div>
          <div><dt>오류</dt><dd>{{ polling.detail.value.run.errorCount }}</dd></div>
          <div><dt>소요 시간</dt><dd>{{ formatDuration(polling.detail.value.run.durationMs) }}</dd></div>
        </dl>
      </section>

      <el-alert v-if="polling.detail.value.run.errorMessage" :title="polling.detail.value.run.errorMessage" type="error" show-icon :closable="false" class="page-alert" />

      <section class="content-section">
        <div class="section-heading"><div><h2>시나리오별 결과</h2><p>각 항목은 별도 testRunId와 브라우저 컨텍스트를 사용합니다.</p></div></div>
        <div class="suite-run-items">
          <article v-for="item in polling.detail.value.items" :key="item.id" class="suite-run-item" :class="`suite-run-item--${item.status}`">
            <span class="step-number">{{ item.order }}</span>
            <div class="suite-run-item__body">
              <div><strong>{{ item.scenarioName }}</strong><AppStatusBadge :status="item.status" /></div>
              <small>시작 {{ formatDateTime(item.startedAt) }} · {{ formatDuration(item.durationMs) }} · {{ item.required ? '필수' : '선택' }}</small>
              <p v-if="item.blockedReason">{{ item.blockedReason }}</p>
              <p v-if="item.errorMessage">{{ item.errorMessage }}</p>
              <code v-if="item.testRunId">testRunId: {{ item.testRunId }}</code>
            </div>
            <div v-if="item.testRunId" class="suite-run-item__actions">
              <el-button text type="primary" @click="router.push(resultPath(item))">개별 결과</el-button>
              <el-button v-if="['failed', 'error'].includes(item.status)" text @click="router.push(`${resultPath(item)}#ai-analysis`)">AI 분석</el-button>
              <el-button text @click="router.push(`/projects/${projectId}/scenarios/${item.scenarioId}`)">실행 비교</el-button>
            </div>
          </article>
        </div>
      </section>

      <section class="content-section suite-snapshot-panel">
        <div class="section-heading"><div><h2>실행 스냅샷</h2><p>원본 스위트나 시나리오가 수정·삭제되어도 이 기록은 변경되지 않습니다.</p></div></div>
        <small>생성 {{ formatDateTime(polling.detail.value.run.suiteSnapshot.createdAt) }} · 버전 {{ polling.detail.value.run.version }}</small>
      </section>
    </template>
  </div>
</template>
