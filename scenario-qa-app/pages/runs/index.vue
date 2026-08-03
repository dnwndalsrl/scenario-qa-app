<script setup lang="ts">
import { formatDateTime, formatDuration } from "../../utils/format";

const router = useRouter();
const runs = useTestRuns();

onMounted(() => {
  void runs.execute();
});

function openRun(run: TestRun): void {
  void router.push(
    `/projects/${run.projectId}/scenarios/${run.scenarioId}/runs/${run.id}`
  );
}
</script>

<template>
  <div>
    <AppPageHeader
      title="테스트 실행 이력"
      description="모든 프로젝트에서 실행한 Playwright 테스트 결과를 확인합니다."
    >
      <el-button :loading="runs.pending.value" @click="runs.refresh">
        새로고침
      </el-button>
    </AppPageHeader>

    <section class="result-panel">
      <el-skeleton v-if="runs.pending.value" :rows="8" animated />
      <el-alert
        v-else-if="runs.error.value"
        :title="runs.error.value"
        type="error"
        show-icon
      >
        <template #default>
          <el-button text @click="runs.refresh">다시 시도</el-button>
        </template>
      </el-alert>
      <AppEmptyState
        v-else-if="!runs.data.value?.length"
        title="아직 실행 이력이 없습니다"
        description="프로젝트의 시나리오에서 테스트 실행을 시작해 주세요."
        action-label="프로젝트 보기"
        @action="router.push('/projects')"
      />
      <div v-else class="run-table-wrap">
        <table class="run-table">
          <thead>
            <tr>
              <th>상태</th>
              <th>실행 ID</th>
              <th>프로젝트 / 시나리오</th>
              <th>단계</th>
              <th>실행 시간</th>
              <th>요청 시각</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="run in runs.data.value" :key="run.id">
              <td><AppStatusBadge :status="run.status" /></td>
              <td><code>{{ run.id }}</code></td>
              <td>
                <small>{{ run.projectId }}</small>
                <strong>{{ run.scenarioId }}</strong>
              </td>
              <td>
                {{ run.successCount }}/{{ run.totalSteps }}
                <small v-if="run.failedCount || run.errorCount">
                  실패·오류 {{ run.failedCount + run.errorCount }}
                </small>
              </td>
              <td>{{ formatDuration(run.durationMs) }}</td>
              <td>{{ formatDateTime(run.createdAt) }}</td>
              <td>
                <el-button text type="primary" @click="openRun(run)">
                  결과 보기
                </el-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
