<script setup lang="ts">
import { ElMessage } from "element-plus";
import type {
  AiScenarioConversionRequest,
  AiScenarioConversionResult
} from "~/shared/types/ai-scenario";
import { aiDraftStepToTestStep } from "~/shared/types/ai-scenario";
import type {
  ScenarioInput,
  TestStep
} from "~/shared/types/scenario";
import { validateScenarioInput } from "~/utils/validate-scenario";

definePageMeta({ middleware: "project-exists" });

const route = useRoute();
const router = useRouter();
const projectId = computed(() => String(route.params.projectId));
const ai = useAiScenarioConversion();
const scenarios = useScenarios(projectId);
const saving = ref(false);
const saveError = ref<string | null>(null);
const result = shallowRef<AiScenarioConversionResult | null>(null);
const editableScenario = ref<ScenarioInput | null>(null);
const reviewedStepIds = ref<string[]>([]);
const unsupportedStepsConfirmed = ref(false);

const form = reactive({
  name: "",
  description: "",
  startUrl: "/login",
  naturalLanguage: "",
  stopOnFailure: true,
  timeout: 90000,
  environmentVariablesText: "TEST_LOGIN_ID\nTEST_LOGIN_PASSWORD",
  additionalContext: ""
});

onMounted(async () => {
  const project = await useProjects().get(projectId.value);
  if (project !== null) {
    form.timeout = project.defaultTimeout;
    form.stopOnFailure = project.stopOnFailure;
  }
});

onBeforeRouteLeave(() => {
  ai.cancel();
});

async function convert(): Promise<void> {
  saveError.value = null;
  const input = buildRequest();
  if (input.name.length === 0 || input.naturalLanguage.length < 10) {
    ai.error.value =
      "시나리오 이름과 10자 이상의 자연어 테스트 절차를 입력해 주세요.";
    return;
  }
  const converted = await ai.convert(input);
  if (converted === null) {
    return;
  }
  result.value = converted;
  editableScenario.value = {
    name: converted.scenarioDraft.name,
    ...(converted.scenarioDraft.description === undefined
      ? {}
      : { description: converted.scenarioDraft.description }),
    startUrl: converted.scenarioDraft.startUrl,
    stopOnFailure: converted.scenarioDraft.stopOnFailure,
    timeout: converted.scenarioDraft.timeout,
    steps: converted.scenarioDraft.steps.map(aiDraftStepToTestStep)
  };
  reviewedStepIds.value = [];
  unsupportedStepsConfirmed.value =
    converted.unsupportedSteps.length === 0;
  await nextTick();
  document
    .querySelector("#ai-conversion-result")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildRequest(): AiScenarioConversionRequest {
  const environmentVariables = form.environmentVariablesText
    .split(/[\n,]/)
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
  const description = form.description.trim();
  const additionalContext = form.additionalContext.trim();
  return {
    projectId: projectId.value,
    name: form.name.trim(),
    ...(description.length === 0 ? {} : { description }),
    startUrl: form.startUrl.trim(),
    naturalLanguage: form.naturalLanguage.trim(),
    stopOnFailure: form.stopOnFailure,
    timeout: form.timeout,
    availableEnvironmentVariables: [...new Set(environmentVariables)],
    ...(additionalContext.length === 0 ? {} : { additionalContext })
  };
}

function confirmAllReviewSteps(): void {
  if (result.value === null || editableScenario.value === null) {
    return;
  }
  const currentIds = new Set(
    editableScenario.value.steps.map((step) => step.id)
  );
  reviewedStepIds.value = result.value.scenarioDraft.steps
    .filter(
      (step) =>
        step.reviewRequired && currentIds.has(step.temporaryId)
    )
    .map((step) => step.temporaryId);
}

async function saveScenario(): Promise<void> {
  if (result.value === null || editableScenario.value === null) {
    return;
  }
  saveError.value = null;
  const input = normalizeScenario(editableScenario.value);
  const issues = validateScenarioInput(input);
  if (issues.length > 0) {
    saveError.value = issues[0]?.message ?? "시나리오 값을 확인해 주세요.";
    return;
  }

  const currentIds = new Set(input.steps.map((step) => step.id));
  const unreviewed = result.value.scenarioDraft.steps.filter(
    (step) =>
      step.reviewRequired &&
      currentIds.has(step.temporaryId) &&
      !reviewedStepIds.value.includes(step.temporaryId)
  );
  if (unreviewed.length > 0) {
    saveError.value = `검토가 필요한 단계 ${unreviewed.length}개를 확인 완료해 주세요.`;
    return;
  }
  if (
    result.value.unsupportedSteps.length > 0 &&
    !unsupportedStepsConfirmed.value
  ) {
    saveError.value = "지원하지 않는 단계를 확인했다고 표시해 주세요.";
    return;
  }

  saving.value = true;
  const created = await scenarios.create(input, {
    conversionId: result.value.conversionId,
    reviewedStepIds: reviewedStepIds.value,
    unsupportedStepsConfirmed: unsupportedStepsConfirmed.value
  });
  saving.value = false;
  if (created === null) {
    saveError.value =
      scenarios.error.value ?? "AI 초안을 시나리오로 저장하지 못했습니다.";
    return;
  }
  ElMessage.success(
    "AI 초안을 검토한 시나리오로 저장했습니다. 실행 전 마지막으로 내용을 확인해 주세요."
  );
  await router.push(
    `/projects/${projectId.value}/scenarios/${created.id}`
  );
}

function normalizeScenario(value: ScenarioInput): ScenarioInput {
  const description = value.description?.trim();
  return {
    name: value.name.trim(),
    ...(description === undefined || description.length === 0
      ? {}
      : { description }),
    startUrl: value.startUrl.trim(),
    stopOnFailure: value.stopOnFailure,
    timeout: value.timeout,
    steps: value.steps.map((step, index) =>
      normalizeStep(step, index)
    )
  };
}

function normalizeStep(step: TestStep, index: number): TestStep {
  const sensitive =
    step.action === "fill" &&
    (step.sensitive === true ||
      /\{\{[^}]*(?:PASSWORD|TOKEN|SECRET|AUTH|COOKIE)[^}]*\}\}/i.test(
        step.value ?? ""
      ));
  return {
    ...step,
    order: index + 1,
    ...(step.action === "fill" ? { sensitive } : {})
  };
}
</script>

<template>
  <div>
    <AppPageHeader
      title="AI로 테스트 초안 만들기"
      description="자연어 테스트 절차를 기존 실행 엔진과 호환되는 단계 초안으로 변환합니다."
    >
      <el-button @click="router.push(`/projects/${projectId}`)">
        프로젝트로 돌아가기
      </el-button>
    </AppPageHeader>

    <el-alert
      class="page-alert"
      type="warning"
      :closable="false"
      show-icon
      title="AI가 생성한 테스트 단계는 초안입니다."
      description="실행 전에 대상 요소, 입력값, 예상 결과를 반드시 확인해 주세요. 변환만 수행하며 테스트를 자동 실행하지 않습니다."
    />

    <el-form
      label-position="top"
      class="scenario-form"
      @submit.prevent="convert"
    >
      <section class="form-panel ai-input-panel">
        <div class="section-heading">
          <div>
            <h2>자연어 시나리오</h2>
            <p>실제 비밀번호나 토큰 대신 환경변수 이름을 사용하세요.</p>
          </div>
        </div>

        <div class="form-grid">
          <el-form-item label="시나리오 이름" required>
            <el-input
              v-model="form.name"
              maxlength="120"
              show-word-limit
              placeholder="관리자 로그인"
            />
          </el-form-item>
          <el-form-item label="시작 URL 또는 경로">
            <el-input v-model="form.startUrl" placeholder="/admin/login" />
          </el-form-item>
        </div>

        <el-form-item label="테스트 목적">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="관리자 로그인 기능을 확인한다."
          />
        </el-form-item>

        <el-form-item label="자연어 테스트 절차" required>
          <el-input
            v-model="form.naturalLanguage"
            type="textarea"
            :rows="10"
            maxlength="10000"
            show-word-limit
            placeholder="로그인 페이지에 접속한다.&#10;아이디 입력창에 TEST_LOGIN_ID 값을 입력한다.&#10;비밀번호 입력창에 TEST_LOGIN_PASSWORD 값을 입력한다.&#10;로그인 버튼을 클릭한다.&#10;URL에 /dashboard가 포함되는지 확인한다."
          />
        </el-form-item>

        <div class="form-grid">
          <el-form-item label="사용 가능한 환경변수 이름">
            <el-input
              v-model="form.environmentVariablesText"
              type="textarea"
              :rows="4"
              placeholder="TEST_LOGIN_ID&#10;TEST_LOGIN_PASSWORD"
            />
            <p class="field-help">
              쉼표 또는 줄바꿈으로 구분합니다. 실제 값은 AI에 전달하지 않습니다.
            </p>
          </el-form-item>
          <el-form-item label="추가 참고사항">
            <el-input
              v-model="form.additionalContext"
              type="textarea"
              :rows="4"
              maxlength="2000"
              placeholder="data-testid나 명확한 접근성 이름이 있을 때만 입력하세요."
            />
          </el-form-item>
        </div>

        <div class="form-grid">
          <el-form-item label="기본 Timeout(ms)" required>
            <el-input-number
              v-model="form.timeout"
              :min="1000"
              :max="300000"
              :step="1000"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item label="필수 단계 실패 시">
            <el-switch
              v-model="form.stopOnFailure"
              active-text="이후 단계 중단"
              inactive-text="계속 실행"
            />
          </el-form-item>
        </div>
      </section>

      <el-alert
        v-if="ai.error.value"
        class="page-alert"
        type="error"
        :title="ai.error.value"
        :closable="false"
        show-icon
      >
        <template #default>
          <p>입력 내용은 유지되어 있습니다. 수정한 뒤 다시 시도할 수 있습니다.</p>
        </template>
      </el-alert>

      <div class="form-actions">
        <el-button
          :disabled="ai.pending.value"
          @click="router.push(`/projects/${projectId}`)"
        >
          취소
        </el-button>
        <el-button
          v-if="ai.pending.value"
          @click="ai.cancel"
        >
          요청 취소
        </el-button>
        <el-button
          type="primary"
          native-type="submit"
          :loading="ai.pending.value"
          :disabled="ai.pending.value"
        >
          {{
            ai.pending.value
              ? "테스트 절차를 단계로 변환하고 있습니다."
              : "AI로 테스트 단계 만들기"
          }}
        </el-button>
      </div>
    </el-form>

    <section
      v-if="result && editableScenario"
      id="ai-conversion-result"
      class="ai-result"
    >
      <div class="section-heading ai-result__heading">
        <div>
          <span class="eyebrow">✓ 변환 완료 · 검토 필요</span>
          <h2>AI 변환 결과</h2>
          <p>지원 가능한 단계만 실행 시나리오 편집기에 전달되었습니다.</p>
        </div>
        <el-button
          v-if="result.summary.reviewRequiredCount > 0"
          plain
          @click="confirmAllReviewSteps"
        >
          현재 남은 검토 단계 모두 확인
        </el-button>
      </div>

      <AiConversionSummary :summary="result.summary" />

      <section
        v-if="
          result.warnings.length ||
          result.missingInformation.length ||
          result.assumptions.length
        "
        class="ai-issue-grid"
      >
        <article v-if="result.missingInformation.length" class="ai-issue-card">
          <h3>! 정보 누락</h3>
          <ul>
            <li
              v-for="item in result.missingInformation"
              :key="`${item.type}-${item.field}`"
            >
              <strong>{{ item.message }}</strong>
              <span>{{ item.suggestedAction }}</span>
            </li>
          </ul>
        </article>
        <article v-if="result.warnings.length" class="ai-issue-card">
          <h3>△ 변환 경고</h3>
          <ul>
            <li
              v-for="warning in result.warnings"
              :key="`${warning.code}-${warning.message}`"
            >
              <strong>{{ warning.message }}</strong>
              <span v-if="warning.suggestedAction">
                {{ warning.suggestedAction }}
              </span>
            </li>
          </ul>
        </article>
        <article v-if="result.assumptions.length" class="ai-issue-card">
          <h3>? AI가 사용한 가정</h3>
          <ul>
            <li
              v-for="assumption in result.assumptions"
              :key="assumption.description"
            >
              <strong>{{ assumption.description }}</strong>
            </li>
          </ul>
        </article>
      </section>

      <section
        v-if="result.unsupportedSteps.length"
        class="ai-unsupported-panel"
      >
        <div class="section-heading">
          <div>
            <h2>△ 현재 자동 실행을 지원하지 않는 단계</h2>
            <p>아래 항목은 실행용 steps에서 제외되었습니다.</p>
          </div>
        </div>
        <ul>
          <li
            v-for="step in result.unsupportedSteps"
            :key="step.temporaryId"
          >
            <span>{{ step.order }}</span>
            <div>
              <strong>{{ step.originalText }}</strong>
              <p>{{ step.reason }}</p>
              <small>{{ step.suggestion }}</small>
            </div>
          </li>
        </ul>
        <el-checkbox v-model="unsupportedStepsConfirmed">
          지원하지 않는 단계가 실행 시나리오에 포함되지 않음을 확인했습니다.
        </el-checkbox>
      </section>

      <AiDraftReviewList
        v-model:reviewed-step-ids="reviewedStepIds"
        :drafts="result.scenarioDraft.steps"
        :current-steps="editableScenario.steps"
      />

      <section class="form-panel">
        <div class="section-heading">
          <div>
            <h2>저장할 시나리오 기본 정보</h2>
            <p>AI가 만든 이름, 시작 경로와 기본 설정도 수정할 수 있습니다.</p>
          </div>
        </div>
        <div class="form-grid">
          <el-form-item label="시나리오 이름" required>
            <el-input v-model="editableScenario.name" maxlength="120" />
          </el-form-item>
          <el-form-item label="시작 URL 또는 경로" required>
            <el-input v-model="editableScenario.startUrl" />
          </el-form-item>
        </div>
        <el-form-item label="설명">
          <el-input
            v-model="editableScenario.description"
            type="textarea"
            :rows="2"
            maxlength="500"
          />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="기본 Timeout(ms)" required>
            <el-input-number
              v-model="editableScenario.timeout"
              :min="1000"
              :max="300000"
              :step="1000"
            />
          </el-form-item>
          <el-form-item label="필수 단계 실패 시">
            <el-switch
              v-model="editableScenario.stopOnFailure"
              active-text="이후 단계 중단"
              inactive-text="계속 실행"
            />
          </el-form-item>
        </div>
      </section>

      <ScenarioStepEditor v-model="editableScenario.steps" />

      <el-alert
        v-if="saveError"
        class="page-alert"
        type="error"
        :title="saveError"
        :closable="false"
        show-icon
      />

      <div class="form-actions form-actions--sticky">
        <el-button :disabled="saving" @click="result = null">
          결과 닫기
        </el-button>
        <el-button type="primary" :loading="saving" @click="saveScenario">
          검토한 시나리오 저장
        </el-button>
      </div>
    </section>
  </div>
</template>
