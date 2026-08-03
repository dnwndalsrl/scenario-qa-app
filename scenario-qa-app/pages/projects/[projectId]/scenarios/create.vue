<script setup lang="ts">
import { ElMessage } from "element-plus";

definePageMeta({ middleware: "project-exists" });

const route = useRoute();
const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const scenarios = useScenarios(projectId);
const saving = ref(false);
const error = ref<string | null>(null);

const initialValue: ScenarioInput = {
  name: "",
  description: "",
  startUrl: "/",
  stopOnFailure: true,
  timeout: 90000,
  steps: [
    {
      id: "new-step-1",
      order: 1,
      name: "",
      action: "goto",
      value: "/",
      timeout: 15000,
      required: true
    }
  ]
};

async function submit(input: ScenarioInput): Promise<void> {
  saving.value = true;
  error.value = null;
  const created = await scenarios.create(input);
  saving.value = false;
  if (created === null) {
    error.value = scenarios.error.value;
    return;
  }
  ElMessage.success("시나리오를 생성했습니다.");
  await router.push(`/projects/${projectId.value}/scenarios/${created.id}`);
}
</script>

<template>
  <div>
    <AppPageHeader
      title="시나리오 생성"
      description="지원 액션으로 실행 가능한 테스트 단계를 구성합니다."
    />
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      class="page-alert"
    />
    <ScenarioForm
      :initial-value="initialValue"
      :pending="saving"
      @submit="submit"
      @cancel="router.push(`/projects/${projectId}`)"
    />
  </div>
</template>
