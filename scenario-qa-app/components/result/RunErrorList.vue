<script setup lang="ts">
defineProps<{
  runError?: string | undefined;
  steps: RunStepResult[];
}>();
</script>

<template>
  <section class="result-panel">
    <div class="section-heading">
      <div>
        <h2>오류 요약</h2>
        <p>실행기 오류와 실패한 단계의 메시지를 모아 표시합니다.</p>
      </div>
    </div>
    <el-alert
      v-if="runError"
      :title="runError"
      type="error"
      :closable="false"
      show-icon
    />
    <ul
      v-if="steps.some((step) => step.errorMessage)"
      class="error-list"
    >
      <li
        v-for="step in steps.filter((item) => item.errorMessage)"
        :key="step.stepId"
      >
        <AppStatusBadge :status="step.status" />
        <div>
          <strong>{{ step.stepName }}</strong>
          <p>{{ step.errorMessage }}</p>
        </div>
      </li>
    </ul>
    <AppEmptyState
      v-else-if="!runError"
      title="기록된 오류가 없습니다"
      description="실행기 오류 또는 단계 실패가 발생하면 여기에 표시됩니다."
    />
  </section>
</template>
