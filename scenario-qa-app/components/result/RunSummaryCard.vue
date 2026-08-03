<script setup lang="ts">
import { formatDateTime, formatDuration } from "../../utils/format";

defineProps<{
  run: TestRun;
  result: RunResult | null;
}>();
</script>

<template>
  <section class="run-summary">
    <div class="run-summary__headline">
      <div>
        <span class="eyebrow">실행 상태</span>
        <AppStatusBadge :status="run.status" />
      </div>
      <div class="run-summary__duration">
        <span>총 실행 시간</span>
        <strong>{{ formatDuration(run.durationMs) }}</strong>
      </div>
    </div>
    <div class="run-summary__metrics">
      <div>
        <strong>{{ run.totalSteps }}</strong>
        <span>전체</span>
      </div>
      <div class="metric--success">
        <strong>{{ run.successCount }}</strong>
        <span>성공</span>
      </div>
      <div class="metric--success">
        <strong>
          {{
            run.totalSteps
              ? Math.round((run.successCount / run.totalSteps) * 100)
              : 0
          }}%
        </strong>
        <span>성공률</span>
      </div>
      <div class="metric--danger">
        <strong>{{ run.failedCount }}</strong>
        <span>실패</span>
      </div>
      <div class="metric--warning">
        <strong>{{ run.blockedCount }}</strong>
        <span>중단</span>
      </div>
      <div class="metric--danger">
        <strong>{{ run.errorCount }}</strong>
        <span>오류</span>
      </div>
    </div>
    <dl class="run-summary__timestamps">
      <div>
        <dt>요청</dt>
        <dd>{{ formatDateTime(run.createdAt) }}</dd>
      </div>
      <div>
        <dt>시작</dt>
        <dd>{{ formatDateTime(run.startedAt) }}</dd>
      </div>
      <div>
        <dt>완료</dt>
        <dd>{{ formatDateTime(run.finishedAt) }}</dd>
      </div>
      <div v-if="result">
        <dt>시나리오</dt>
        <dd>{{ result.scenarioName }}</dd>
      </div>
    </dl>
  </section>
</template>
