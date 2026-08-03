<script setup lang="ts">
import { ElMessage } from "element-plus";

definePageMeta({ middleware: "project-exists" });
const route = useRoute();
const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const suiteId = computed(() => String(route.params.suiteId));
const scenarios = useScenarios(projectId);
const suite = useTestSuite(projectId, suiteId);
const suites = useTestSuites(projectId);
const saving = ref(false);

onMounted(async () => {
  await Promise.all([scenarios.execute(), suite.execute()]);
});

async function submit(input: TestSuiteInput): Promise<void> {
  saving.value = true;
  const updated = await suites.update(suiteId.value, input);
  saving.value = false;
  if (updated === null) {
    ElMessage.error(suites.error.value ?? "스위트를 수정하지 못했습니다.");
    return;
  }
  ElMessage.success("테스트 스위트를 수정했습니다.");
  await router.push(`/projects/${projectId.value}/test-suites/${suiteId.value}`);
}
</script>

<template>
  <div>
    <AppPageHeader title="테스트 스위트 수정" description="저장 시 실행 순서는 1부터 다시 정렬됩니다." />
    <el-alert v-if="scenarios.error.value || suite.error.value || suites.error.value" :title="scenarios.error.value || suite.error.value || suites.error.value || ''" type="error" show-icon class="page-alert" />
    <div v-if="scenarios.pending.value || suite.pending.value" class="form-panel"><el-skeleton :rows="8" animated /></div>
    <TestSuiteForm v-else-if="suite.data.value" :scenarios="scenarios.data.value ?? []" :initial-value="suite.data.value.suite" :pending="saving" @submit="submit" @cancel="router.push(`/projects/${projectId}/test-suites/${suiteId}`)" />
  </div>
</template>
