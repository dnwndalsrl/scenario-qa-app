<script setup lang="ts">
import { ElMessage } from "element-plus";
import { formatDateTime } from "../../../../utils/format";

definePageMeta({ middleware: "project-exists" });
const route = useRoute();
const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const suites = useTestSuites(projectId);
const deleteId = ref<string | null>(null);
const deleting = ref(false);

onMounted(() => void suites.execute());

async function remove(): Promise<void> {
  if (deleteId.value === null) return;
  deleting.value = true;
  const removed = await suites.remove(deleteId.value);
  deleting.value = false;
  if (!removed) {
    ElMessage.error(suites.error.value ?? "스위트를 삭제하지 못했습니다.");
    return;
  }
  deleteId.value = null;
  ElMessage.success("스위트 구성을 삭제했습니다. 과거 실행 스냅샷은 유지됩니다.");
  await suites.refresh();
}
</script>

<template>
  <div>
    <AppPageHeader title="테스트 스위트" description="프로젝트의 시나리오 묶음과 최근 실행 상태를 관리합니다.">
      <el-button type="primary" @click="router.push(`/projects/${projectId}/test-suites/create`)">+ 스위트 생성</el-button>
      <el-button @click="router.push(`/projects/${projectId}`)">프로젝트로 돌아가기</el-button>
    </AppPageHeader>
    <el-alert v-if="suites.error.value" :title="suites.error.value" type="error" show-icon class="page-alert" />
    <div v-if="suites.pending.value" class="form-panel"><el-skeleton :rows="6" animated /></div>
    <AppEmptyState v-else-if="!suites.data.value?.length" title="테스트 스위트가 없습니다" description="여러 시나리오를 묶어 첫 순차 실행을 준비하세요." action-label="스위트 생성" @action="router.push(`/projects/${projectId}/test-suites/create`)" />
    <div v-else class="suite-list">
      <article v-for="suite in suites.data.value" :key="suite.id" class="suite-list-card">
        <div class="suite-list-card__main">
          <div class="suite-list-card__badges">
            <AppStatusBadge :status="suite.status" />
            <AppStatusBadge v-if="suite.recentRunStatus" :status="suite.recentRunStatus" />
          </div>
          <h2>{{ suite.name }}</h2>
          <p>{{ suite.description || "설명 없음" }}</p>
          <small>전체 {{ suite.items.length }} · 실행 {{ suite.executableItems }} · 최근 실행 {{ formatDateTime(suite.recentRunAt) }}</small>
          <el-alert v-if="suite.invalidScenarioCount" :title="`삭제된 시나리오 ${suite.invalidScenarioCount}개가 포함되어 실행할 수 없습니다.`" type="warning" :closable="false" />
        </div>
        <div class="suite-list-card__actions">
          <el-button type="primary" @click="router.push(`/projects/${projectId}/test-suites/${suite.id}`)">상세</el-button>
          <el-button @click="router.push(`/projects/${projectId}/test-suites/${suite.id}/edit`)">수정</el-button>
          <el-button type="danger" plain @click="deleteId = suite.id">삭제</el-button>
        </div>
      </article>
    </div>
    <AppConfirmDialog :model-value="deleteId !== null" title="테스트 스위트 삭제" message="스위트 구성만 삭제합니다. 스냅샷이 저장된 과거 실행 이력과 개별 테스트 결과는 유지됩니다." confirm-label="삭제" danger :pending="deleting" @update:model-value="deleteId = $event ? deleteId : null" @confirm="remove" />
  </div>
</template>
