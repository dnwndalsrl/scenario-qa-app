<script setup lang="ts">
import { ElMessage } from "element-plus";

definePageMeta({ middleware: "project-exists" });

const route = useRoute();
const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const scenarioId = computed(() => String(route.params.scenarioId));
const scenarios = useScenarios(projectId);
const scenario = shallowRef<TestScenario | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  scenario.value = await scenarios.get(scenarioId.value);
  error.value = scenarios.error.value;
  loading.value = false;
});

const initialValue = computed<ScenarioInput | null>(() => {
  if (scenario.value === null) {
    return null;
  }
  return {
    name: scenario.value.name,
    ...(scenario.value.description === undefined
      ? {}
      : { description: scenario.value.description }),
    startUrl: scenario.value.startUrl,
    stopOnFailure: scenario.value.stopOnFailure,
    timeout: scenario.value.timeout,
    steps: structuredClone(scenario.value.steps)
  };
});

async function submit(input: ScenarioInput): Promise<void> {
  saving.value = true;
  error.value = null;
  const updated = await scenarios.update(scenarioId.value, input);
  saving.value = false;
  if (updated === null) {
    error.value = scenarios.error.value;
    return;
  }
  ElMessage.success("시나리오를 수정했습니다.");
  await router.push(
    `/projects/${projectId.value}/scenarios/${scenarioId.value}`
  );
}
</script>

<template>
  <div>
    <AppPageHeader
      title="시나리오 수정"
      description="단계 변경 후 저장하면 순서가 1부터 다시 정렬됩니다."
    />
    <div v-if="loading" class="form-panel">
      <el-skeleton :rows="10" animated />
    </div>
    <el-alert
      v-else-if="error || !initialValue"
      :title="error || '시나리오를 찾을 수 없습니다.'"
      type="error"
      show-icon
    />
    <ScenarioForm
      v-else
      :initial-value="initialValue"
      :pending="saving"
      submit-label="변경 내용 저장"
      @submit="submit"
      @cancel="
        router.push(
          `/projects/${projectId}/scenarios/${scenarioId}`
        )
      "
    />
  </div>
</template>
