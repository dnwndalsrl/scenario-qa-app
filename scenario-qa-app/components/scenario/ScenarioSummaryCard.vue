<script setup lang="ts">
import { formatDateTime } from "../../utils/format";

defineProps<{
  scenario: ScenarioSummary;
  running?: boolean;
}>();

const emit = defineEmits<{
  open: [scenarioId: string];
  run: [scenarioId: string];
  edit: [scenarioId: string];
  remove: [scenarioId: string];
}>();
</script>

<template>
  <article class="scenario-card">
    <div class="scenario-card__main">
      <div class="scenario-card__title-row">
        <h3>
          <button type="button" @click="emit('open', scenario.id)">
            {{ scenario.name }}
          </button>
        </h3>
        <AppStatusBadge
          v-if="scenario.recentRunStatus"
          :status="scenario.recentRunStatus"
        />
      </div>
      <p>{{ scenario.description || "설명이 등록되지 않았습니다." }}</p>
      <div class="scenario-card__meta">
        <span>{{ scenario.steps.length }}단계</span>
        <span>최근 실행 {{ formatDateTime(scenario.recentRunAt) }}</span>
      </div>
    </div>
    <div class="scenario-card__actions">
      <el-button
        type="primary"
        :loading="running || Boolean(scenario.activeRunId)"
        @click="emit('run', scenario.id)"
      >
        {{ scenario.activeRunId ? "실행 중" : "실행" }}
      </el-button>
      <el-button @click="emit('edit', scenario.id)">수정</el-button>
      <el-button type="danger" plain @click="emit('remove', scenario.id)">
        삭제
      </el-button>
    </div>
  </article>
</template>
