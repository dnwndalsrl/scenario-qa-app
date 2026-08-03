<script setup lang="ts">
import { ElMessage } from "element-plus";

const router = useRouter();
const projects = useProjects();
const saving = ref(false);
const error = ref<string | null>(null);

async function submit(input: ProjectInput): Promise<void> {
  saving.value = true;
  error.value = null;
  const created = await projects.create(input);
  saving.value = false;
  if (created === null) {
    error.value = projects.error.value;
    return;
  }
  ElMessage.success("프로젝트를 생성했습니다.");
  await router.push(`/projects/${created.id}`);
}
</script>

<template>
  <div class="narrow-page">
    <AppPageHeader
      title="프로젝트 생성"
      description="테스트 대상 URL과 기본 실행 정책을 등록합니다."
    />
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      class="page-alert"
    />
    <ProjectForm
      :pending="saving"
      @submit="submit"
      @cancel="router.push('/projects')"
    />
  </div>
</template>
