<script setup lang="ts">
import { ElMessage } from "element-plus";
import { formatDateTime } from "../../../../utils/format";
definePageMeta({ middleware: "project-exists" });
const route = useRoute(); const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const schedules = useTestSchedules(projectId);
const deleteId = ref<string | null>(null); const busyId = ref<string | null>(null);
onMounted(() => void schedules.execute());
async function toggle(schedule: TestSchedule): Promise<void> {
  busyId.value = schedule.id;
  const saved = await schedules.setStatus(schedule.id, schedule.status === "active" ? "inactive" : "active");
  busyId.value = null;
  if (!saved) ElMessage.error(schedules.error.value ?? "상태를 변경하지 못했습니다."); else await schedules.refresh();
}
async function runNow(schedule: TestSchedule): Promise<void> {
  busyId.value = schedule.id; const result = await schedules.runNow(schedule.id); busyId.value = null;
  if (!result) ElMessage.error(schedules.error.value ?? "즉시 실행하지 못했습니다.");
  else { ElMessage.success("예약 실행을 요청했습니다."); await router.push(`/projects/${projectId.value}/schedules/${schedule.id}/executions/${result.id}`); }
}
async function remove(): Promise<void> {
  if (!deleteId.value) return; busyId.value = deleteId.value;
  const removed = await schedules.remove(deleteId.value); busyId.value = null;
  if (!removed) ElMessage.error(schedules.error.value ?? "예약을 삭제하지 못했습니다.");
  else { deleteId.value = null; ElMessage.success("예약을 삭제했습니다."); await schedules.refresh(); }
}
</script>
<template>
  <div>
    <AppPageHeader title="예약 실행" description="테스트 스위트를 정해진 시간대와 반복 규칙에 따라 자동 실행합니다.">
      <el-button type="primary" @click="router.push(`/projects/${projectId}/schedules/create`)">+ 예약 만들기</el-button>
      <el-button @click="router.push(`/projects/${projectId}`)">프로젝트로 돌아가기</el-button>
    </AppPageHeader>
    <el-alert v-if="schedules.error.value" :title="schedules.error.value" type="error" show-icon class="page-alert" />
    <div v-if="schedules.pending.value" class="form-panel"><el-skeleton :rows="6" animated /></div>
    <AppEmptyState v-else-if="!schedules.data.value?.length" title="등록된 예약이 없습니다" description="테스트 스위트의 첫 자동 실행 일정을 만들어 보세요." action-label="예약 만들기" @action="router.push(`/projects/${projectId}/schedules/create`)" />
    <div v-else class="schedule-list">
      <article v-for="schedule in schedules.data.value" :key="schedule.id" class="suite-list-card schedule-list-card">
        <div class="suite-list-card__main">
          <div class="suite-list-card__badges"><AppStatusBadge :status="schedule.status" /><AppStatusBadge v-if="schedule.lastRunStatus" :status="schedule.lastRunStatus" /></div>
          <h2>{{ schedule.name }}</h2>
          <p>{{ schedule.suiteName }} · {{ schedule.timezone }} · {{ schedule.scheduleType }}</p>
          <small>다음 실행 {{ formatDateTime(schedule.nextRunAt) }} · 최근 실행 {{ formatDateTime(schedule.lastRunAt) }}</small>
          <div class="schedule-channel-list"><span v-for="channel in schedule.notificationPolicy.channels" :key="channel">{{ channel }}</span></div>
        </div>
        <div class="suite-list-card__actions">
          <el-button type="primary" @click="router.push(`/projects/${projectId}/schedules/${schedule.id}`)">상세</el-button>
          <el-button :loading="busyId === schedule.id" @click="runNow(schedule)">지금 실행</el-button>
          <el-button @click="router.push(`/projects/${projectId}/schedules/${schedule.id}/edit`)">수정</el-button>
          <el-button @click="toggle(schedule)">{{ schedule.status === "active" ? "비활성화" : "활성화" }}</el-button>
          <el-button type="danger" plain @click="deleteId = schedule.id">삭제</el-button>
        </div>
      </article>
    </div>
    <AppConfirmDialog :model-value="deleteId !== null" title="예약 삭제" message="예약을 비활성화하고 비밀값을 제거합니다. 과거 실행 기록은 유지됩니다." confirm-label="삭제" danger :pending="busyId !== null" @update:model-value="deleteId = $event ? deleteId : null" @confirm="remove" />
  </div>
</template>
