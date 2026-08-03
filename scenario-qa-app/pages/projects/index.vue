<script setup lang="ts">
const router = useRouter();
const projects = useProjects();

onMounted(() => {
  void projects.execute();
});
</script>

<template>
  <div>
    <AppPageHeader
      title="프로젝트"
      description="테스트 대상과 시나리오를 프로젝트 단위로 관리합니다."
    >
      <el-button type="primary" @click="router.push('/projects/create')">
        + 프로젝트 생성
      </el-button>
    </AppPageHeader>

    <div v-if="projects.pending.value" class="loading-grid">
      <el-skeleton v-for="item in 3" :key="item" :rows="5" animated />
    </div>
    <el-alert
      v-else-if="projects.error.value"
      :title="projects.error.value"
      type="error"
      show-icon
    >
      <template #default>
        <el-button text @click="projects.refresh">다시 시도</el-button>
      </template>
    </el-alert>
    <AppEmptyState
      v-else-if="!projects.data.value?.length"
      title="아직 프로젝트가 없습니다"
      description="첫 테스트 프로젝트를 만들고 자동 검증을 시작하세요."
      action-label="프로젝트 생성"
      @action="router.push('/projects/create')"
    />
    <div v-else class="project-grid">
      <ProjectCard
        v-for="project in projects.data.value"
        :key="project.id"
        :project="project"
        @open="router.push(`/projects/${$event}`)"
      />
    </div>
  </div>
</template>
