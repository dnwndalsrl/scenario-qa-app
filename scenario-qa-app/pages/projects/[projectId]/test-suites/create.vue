<script setup lang="ts">
import { ElMessage } from "element-plus";

definePageMeta({ middleware: "project-exists" });
const route = useRoute();
const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const scenarios = useScenarios(projectId);
const suites = useTestSuites(projectId);
const saving = ref(false);

onMounted(() => void scenarios.execute());

async function submit(input: TestSuiteInput): Promise<void> {
  saving.value = true;
  const created = await suites.create(input);
  saving.value = false;
  if (created === null) {
    ElMessage.error(suites.error.value ?? "스위트를 생성하지 못했습니다.");
    return;
  }
  ElMessage.success("테스트 스위트를 생성했습니다.");
  await router.push(`/projects/${projectId.value}/test-suites/${created.id}`);
}
</script>

<template>
  <div>
    <AppPageHeader title="테스트 스위트 생성" description="시나리오를 선택하고 실행 순서, 활성 여부와 중단 정책을 정합니다." />
    <el-alert v-if="scenarios.error.value || suites.error.value" :title="scenarios.error.value || suites.error.value || ''" type="error" show-icon class="page-alert" />
    <div v-if="scenarios.pending.value" class="form-panel"><el-skeleton :rows="8" animated /></div>
    <TestSuiteForm v-else :scenarios="scenarios.data.value ?? []" :pending="saving" @submit="submit" @cancel="router.push(`/projects/${projectId}/test-suites`)" />
  </div>
</template>
