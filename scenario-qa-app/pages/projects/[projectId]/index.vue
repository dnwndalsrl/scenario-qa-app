<script setup lang="ts">
import { ElMessage } from "element-plus";

definePageMeta({ middleware: "project-exists" });

const route = useRoute();
const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const project = shallowRef<TestProject | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const scenarios = useScenarios(projectId);
const suites = useTestSuites(projectId);
const runs = useTestRuns();
const runningScenarioId = ref<string | null>(null);
const deleteScenarioId = ref<string | null>(null);
const deleting = ref(false);
const showProjectDelete = ref(false);

onMounted(() => {
  void load();
});

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  const projects = useProjects();
  const [projectValue] = await Promise.all([
    projects.get(projectId.value),
    scenarios.execute(),
    suites.execute()
  ]);
  project.value = projectValue;
  loadError.value =
    projects.error.value ?? scenarios.error.value ?? suites.error.value;
  loading.value = false;
}

async function runScenario(scenarioId: string): Promise<void> {
  runningScenarioId.value = scenarioId;
  const accepted = await runs.create({
    projectId: projectId.value,
    scenarioId
  });
  runningScenarioId.value = null;
  if (accepted === null) {
    ElMessage.error(runs.error.value ?? "테스트 실행을 요청하지 못했습니다.");
    return;
  }
  await router.push(
    `/projects/${projectId.value}/scenarios/${scenarioId}/runs/${accepted.runId}`
  );
}

async function confirmScenarioDelete(): Promise<void> {
  if (deleteScenarioId.value === null) {
    return;
  }
  deleting.value = true;
  const removed = await scenarios.remove(deleteScenarioId.value);
  deleting.value = false;
  if (!removed) {
    ElMessage.error(scenarios.error.value ?? "시나리오를 삭제하지 못했습니다.");
    return;
  }
  deleteScenarioId.value = null;
  ElMessage.success("시나리오와 관련 실행 이력을 삭제했습니다.");
  await Promise.all([scenarios.refresh(), suites.refresh()]);
}

async function deleteProject(): Promise<void> {
  deleting.value = true;
  const removed = await useProjects().remove(projectId.value);
  deleting.value = false;
  if (!removed) {
    ElMessage.error("프로젝트를 삭제하지 못했습니다.");
    return;
  }
  ElMessage.success("프로젝트와 관련 데이터를 삭제했습니다.");
  await router.push("/projects");
}
</script>

<template>
  <div>
    <div v-if="loading" class="form-panel">
      <el-skeleton :rows="8" animated />
    </div>
    <el-alert
      v-else-if="loadError || !project"
      :title="loadError || '프로젝트를 찾을 수 없습니다.'"
      type="error"
      show-icon
    />
    <template v-else>
      <AppPageHeader
        :title="project.name"
        :description="project.description || '프로젝트 상세 및 시나리오 관리'"
      >
        <el-button
          @click="
            router.push(`/projects/${projectId}/scenarios/ai-create`)
          "
        >
          ✦ AI로 초안 만들기
        </el-button>
        <el-button
          type="primary"
          @click="
            router.push(`/projects/${projectId}/scenarios/create`)
          "
        >
          + 시나리오 생성
        </el-button>
        <el-button type="danger" plain @click="showProjectDelete = true">
          프로젝트 삭제
        </el-button>
      </AppPageHeader>

      <nav class="project-tabs" aria-label="프로젝트 관리 메뉴">
        <a href="#scenarios">시나리오</a>
        <NuxtLink :to="`/projects/${projectId}/dashboard`">품질 대시보드</NuxtLink>
        <NuxtLink :to="`/projects/${projectId}/readiness`">실사용 준비도</NuxtLink>
        <NuxtLink :to="`/projects/${projectId}/test-suites`">스위트</NuxtLink>
        <NuxtLink :to="`/projects/${projectId}/schedules`">예약 실행</NuxtLink>
        <NuxtLink to="/runs">실행 이력</NuxtLink>
      </nav>

      <section class="info-strip">
        <div>
          <span>기본 URL</span>
          <strong>{{ project.baseUrl }}</strong>
        </div>
        <div>
          <span>환경</span>
          <strong>{{ project.environmentName }}</strong>
        </div>
        <div>
          <span>기본 Timeout</span>
          <strong>{{ project.defaultTimeout.toLocaleString() }}ms</strong>
        </div>
        <div>
          <span>실패 정책</span>
          <strong>
            {{ project.stopOnFailure ? "이후 단계 중단" : "계속 실행" }}
          </strong>
        </div>
      </section>

      <section class="content-section">
        <div class="section-heading">
          <div>
            <h2>테스트 스위트</h2>
            <p>여러 시나리오를 고정된 순서와 정책으로 순차 실행합니다.</p>
          </div>
          <el-button
            type="primary"
            @click="router.push(`/projects/${projectId}/test-suites/create`)"
          >
            + 스위트 생성
          </el-button>
        </div>
        <el-skeleton v-if="suites.pending.value" :rows="3" animated />
        <AppEmptyState
          v-else-if="!suites.data.value?.length"
          title="테스트 스위트가 없습니다"
          description="시나리오를 묶어 순차 실행할 첫 스위트를 만드세요."
          action-label="스위트 생성"
          @action="router.push(`/projects/${projectId}/test-suites/create`)"
        />
        <div v-else class="suite-card-grid">
          <article
            v-for="suite in suites.data.value.slice(0, 3)"
            :key="suite.id"
            class="suite-card"
          >
            <div>
              <AppStatusBadge :status="suite.status" />
              <AppStatusBadge
                v-if="suite.recentRunStatus"
                :status="suite.recentRunStatus"
              />
            </div>
            <h3>{{ suite.name }}</h3>
            <p>{{ suite.items.length }}개 항목 · {{ suite.executableItems }}개 실행</p>
            <el-alert
              v-if="suite.invalidScenarioCount"
              :title="`삭제된 시나리오 ${suite.invalidScenarioCount}개`"
              type="warning"
              :closable="false"
            />
            <el-button
              text
              type="primary"
              @click="router.push(`/projects/${projectId}/test-suites/${suite.id}`)"
            >
              상세 보기
            </el-button>
          </article>
        </div>
        <div v-if="suites.data.value?.length" class="section-footer-action">
          <el-button @click="router.push(`/projects/${projectId}/test-suites`)">
            전체 스위트 보기
          </el-button>
        </div>
      </section>

      <section id="scenarios" class="content-section">
        <div class="section-heading">
          <div>
            <h2>테스트 시나리오</h2>
            <p>저장된 단계와 최근 실행 상태를 확인할 수 있습니다.</p>
          </div>
        </div>
        <el-skeleton v-if="scenarios.pending.value" :rows="6" animated />
        <el-alert
          v-else-if="scenarios.error.value"
          :title="scenarios.error.value"
          type="error"
          show-icon
        />
        <AppEmptyState
          v-else-if="!scenarios.data.value?.length"
          title="시나리오가 없습니다"
          description="첫 시나리오를 등록해 브라우저 테스트를 시작하세요."
          action-label="시나리오 생성"
          @action="
            router.push(`/projects/${projectId}/scenarios/create`)
          "
        />
        <div v-else class="scenario-list">
          <ScenarioSummaryCard
            v-for="scenario in scenarios.data.value"
            :key="scenario.id"
            :scenario="scenario"
            :running="runningScenarioId === scenario.id"
            @open="
              router.push(
                `/projects/${projectId}/scenarios/${$event}`
              )
            "
            @run="runScenario"
            @edit="
              router.push(
                `/projects/${projectId}/scenarios/${$event}/edit`
              )
            "
            @remove="deleteScenarioId = $event"
          />
        </div>
      </section>
    </template>

    <AppConfirmDialog
      :model-value="deleteScenarioId !== null"
      title="시나리오 삭제"
      message="시나리오와 관련 실행 결과 및 스크린샷이 모두 삭제됩니다."
      confirm-label="삭제"
      danger
      :pending="deleting"
      @update:model-value="
        deleteScenarioId = $event ? deleteScenarioId : null
      "
      @confirm="confirmScenarioDelete"
    />
    <AppConfirmDialog
      v-model="showProjectDelete"
      title="프로젝트 삭제"
      message="하위 시나리오, 실행 이력, 결과 파일과 스크린샷이 모두 삭제됩니다."
      confirm-label="프로젝트 삭제"
      danger
      :pending="deleting"
      @confirm="deleteProject"
    />
  </div>
</template>
