<script setup lang="ts">
import { ElMessage } from "element-plus";
definePageMeta({ middleware: "project-exists" });
const route = useRoute(); const router = useRouter();
const projectId = computed(() => String(route.params.projectId)); const scheduleId = computed(() => String(route.params.scheduleId));
const schedules = useTestSchedules(projectId); const suites = useTestSuites(projectId);
const initial = shallowRef<TestSchedule | null>(null); const loading = ref(true); const saving = ref(false); const previewPending = ref(false); const preview = shallowRef<SchedulePreviewResult | null>(null);
onMounted(async () => { const [detail] = await Promise.all([schedules.get(scheduleId.value), suites.execute()]); initial.value = detail?.schedule ?? null; loading.value = false; });
async function save(input: TestScheduleInput): Promise<void> { saving.value = true; const saved = await schedules.update(scheduleId.value, input); saving.value = false; if (!saved) ElMessage.error(schedules.error.value ?? "예약을 수정하지 못했습니다."); else { ElMessage.success("예약을 수정했습니다."); await router.push(`/projects/${projectId.value}/schedules/${scheduleId.value}`); } }
async function showPreview(input: Pick<TestScheduleInput, "scheduleType" | "scheduleConfig" | "timezone">): Promise<void> { previewPending.value = true; preview.value = await schedules.preview(input); previewPending.value = false; if (!preview.value) ElMessage.error(schedules.error.value ?? "일정을 계산하지 못했습니다."); }
</script>
<template><div><AppPageHeader title="예약 수정" description="저장된 비밀값은 화면과 API에 원문으로 노출되지 않습니다." /><div v-if="loading" class="form-panel"><el-skeleton :rows="8" animated /></div><el-alert v-else-if="!initial" :title="schedules.error.value ?? '예약을 찾을 수 없습니다.'" type="error" show-icon /><ScheduleForm v-else :suites="suites.data.value ?? []" :initial-value="initial" :pending="saving" :preview="preview" :preview-pending="previewPending" @submit="save" @preview="showPreview" @cancel="router.push(`/projects/${projectId}/schedules/${scheduleId}`)" /></div></template>
