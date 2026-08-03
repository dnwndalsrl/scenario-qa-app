<script setup lang="ts">
import { formatDateTime } from "../../utils/format";

defineProps<{
  project: ProjectSummary;
}>();

const emit = defineEmits<{
  open: [projectId: string];
}>();
</script>

<template>
  <article
    class="project-card"
    tabindex="0"
    @click="emit('open', project.id)"
    @keydown.enter="emit('open', project.id)"
  >
    <div class="project-card__top">
      <div>
        <span class="eyebrow">{{ project.environmentName }}</span>
        <h2>{{ project.name }}</h2>
      </div>
      <AppStatusBadge
        v-if="project.recentRunStatus"
        :status="project.recentRunStatus"
      />
    </div>
    <p class="project-card__description">
      {{ project.description || "설명이 등록되지 않았습니다." }}
    </p>
    <code class="project-card__url">{{ project.baseUrl }}</code>
    <dl class="project-card__meta">
      <div>
        <dt>시나리오</dt>
        <dd>{{ project.scenarioCount }}개</dd>
      </div>
      <div>
        <dt>최근 실행</dt>
        <dd>{{ formatDateTime(project.recentRunAt) }}</dd>
      </div>
    </dl>
  </article>
</template>
