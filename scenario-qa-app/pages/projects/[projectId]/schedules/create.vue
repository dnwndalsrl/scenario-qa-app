<script setup lang="ts">
import { ElMessage } from "element-plus";
definePageMeta({ middleware: "project-exists" });
const route = useRoute(); const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const schedules = useTestSchedules(projectId); const suites = useTestSuites(projectId);
const saving = ref(false); const previewPending = ref(false); const preview = shallowRef<SchedulePreviewResult | null>(null);
onMounted(() => void suites.execute());
async function save(input: TestScheduleInput): Promise<void> {
  saving.value = true; const saved = await schedules.create(input); saving.value = false;
  if (!saved) ElMessage.error(schedules.error.value ?? "예약을 저장하지 못했습니다.");
  else { ElMessage.success("예약을 만들었습니다."); await router.push(`/projects/${projectId.value}/schedules/${saved.id}`); }
}
async function showPreview(input: Pick<TestScheduleInput, "scheduleType" | "scheduleConfig" | "timezone">): Promise<void> {
  previewPending.value = true; preview.value = await schedules.preview(input); previewPending.value = false;
  if (!preview.value) ElMessage.error(schedules.error.value ?? "일정을 계산하지 못했습니다.");
}
</script>
<template><div><AppPageHeader title="예약 만들기" description="스위트, 시간대, 충돌 정책과 알림 채널을 설정합니다." /><el-skeleton v-if="suites.pending.value" :rows="8" animated /><ScheduleForm v-else :suites="suites.data.value ?? []" :pending="saving" :preview="preview" :preview-pending="previewPending" @submit="save" @preview="showPreview" @cancel="router.push(`/projects/${projectId}/schedules`)" /></div></template>
