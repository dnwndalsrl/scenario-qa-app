<script setup lang="ts">
import { ElMessage } from "element-plus";

const props = defineProps<{
  runId: string;
  runStatus: TestRunStatus;
}>();

const emit = defineEmits<{
  "select-evidence": [
    evidenceId: string,
    evidenceType: EvidenceType,
    stepId?: string
  ];
}>();

const analysisState = useAiFailureAnalysis(() => props.runId);
const checkedItems = ref<string[]>([]);
const canAnalyze = computed(() =>
  ["failed", "error", "blocked"].includes(props.runStatus)
);

onMounted(analysisState.start);

async function requestAnalysis(): Promise<void> {
  const succeeded = await analysisState.request(false);
  if (succeeded) {
    ElMessage.success(
      analysisState.analysis.value?.status === "completed"
        ? "기존 AI 분석 결과를 불러왔습니다."
        : "AI 실패 분석을 시작했습니다."
    );
  }
}

async function retryAnalysis(): Promise<void> {
  if (await analysisState.retry()) {
    ElMessage.success("새 AI 실패 분석을 시작했습니다.");
  }
}

function selectEvidence(evidenceId: string): void {
  const evidence = analysisState.analysis.value?.evidence.find(
    (item) => item.id === evidenceId
  );
  if (evidence === undefined) {
    return;
  }
  emit(
    "select-evidence",
    evidence.id,
    evidence.type,
    ...(evidence.stepId === undefined ? [] : [evidence.stepId])
  );
}

function confidenceLabel(value: number): string {
  if (value >= 0.85) return "강한 근거";
  if (value >= 0.65) return "가능성이 높음";
  if (value >= 0.4) return "추가 확인 필요";
  return "판단 근거 부족";
}

function confidenceTone(value: number): string {
  if (value >= 0.85) return "high";
  if (value >= 0.65) return "medium";
  return "low";
}

const categoryLabels: Record<FailureCategory, string> = {
  element_not_found: "요소 미발견",
  element_not_visible: "요소 비노출",
  element_not_enabled: "요소 비활성",
  multiple_elements_found: "복수 요소 발견",
  url_mismatch: "URL 불일치",
  text_mismatch: "문구 불일치",
  input_value_mismatch: "입력값 불일치",
  navigation_timeout: "이동 시간 초과",
  action_timeout: "동작 시간 초과",
  network_failure: "네트워크 실패",
  http_client_error: "HTTP 클라이언트 오류",
  http_server_error: "HTTP 서버 오류",
  console_error: "콘솔 오류",
  authentication_failure: "인증 실패",
  authorization_failure: "권한 실패",
  frontend_state_issue: "프론트 상태 문제",
  api_response_issue: "API 응답 문제",
  rendering_issue: "렌더링 문제",
  environment_issue: "환경 문제",
  test_data_issue: "테스트 데이터 문제",
  scenario_issue: "시나리오 문제",
  selector_issue: "선택자 문제",
  unknown: "판단 근거 부족"
};

const roleLabels: Record<AnalysisTargetRole, string> = {
  frontend: "프론트엔드",
  backend: "백엔드",
  qa: "QA",
  planning: "기획",
  infrastructure: "인프라",
  unknown: "담당 미정"
};

const priorityLabels: Record<AnalysisPriority, string> = {
  critical: "긴급",
  high: "높음",
  medium: "보통",
  low: "낮음"
};
</script>

<template>
  <section v-if="canAnalyze" class="ai-analysis-panel">
    <div class="section-heading ai-analysis-panel__heading">
      <div>
        <span class="eyebrow">AI FAILURE ANALYSIS</span>
        <h2>실패 원인 분석</h2>
        <p>
          AI 분석은 수집된 테스트 로그를 기반으로 한 추정 결과입니다.
          실제 코드와 서버 설정을 확인한 뒤 판단해 주세요.
        </p>
      </div>
      <el-button
        v-if="!analysisState.analysis.value"
        type="primary"
        :loading="analysisState.requesting.value"
        @click="requestAnalysis"
      >
        AI로 실패 원인 분석
      </el-button>
      <el-button
        v-else-if="!analysisState.isActive.value"
        type="primary"
        plain
        :loading="analysisState.requesting.value"
        @click="retryAnalysis"
      >
        AI 분석 다시 실행
      </el-button>
    </div>

    <el-alert
      title="이 분석은 테스트 실행 로그를 기반으로 생성된 추정 결과입니다. 실제 원인은 코드, 서버 설정 및 테스트 환경을 추가로 확인해야 합니다."
      type="warning"
      :closable="false"
      show-icon
      class="page-alert"
    />

    <div v-if="analysisState.loading.value" class="ai-analysis-loading">
      <el-skeleton :rows="4" animated />
    </div>

    <el-alert
      v-if="analysisState.error.value"
      :title="analysisState.error.value"
      type="error"
      show-icon
      class="page-alert"
    >
      <template #default>
        <el-button text @click="analysisState.refresh">상태 다시 확인</el-button>
      </template>
    </el-alert>

    <div
      v-if="analysisState.isActive.value"
      class="ai-analysis-progress"
    >
      <span class="run-progress-banner__spinner" />
      <div>
        <strong>
          {{
            analysisState.analysis.value?.status === "pending"
              ? "분석 대기 중"
              : "수집된 실패 근거 분석 중"
          }}
        </strong>
        <p>2초 간격으로 분석 상태를 확인합니다. 테스트를 다시 실행하지 않습니다.</p>
      </div>
      <small v-if="analysisState.refreshing.value">상태 확인 중…</small>
    </div>

    <el-alert
      v-else-if="analysisState.analysis.value?.status === 'failed'"
      :title="analysisState.analysis.value.errorMessage ?? 'AI 분석에 실패했습니다.'"
      type="error"
      :closable="false"
      show-icon
    />

    <template
      v-if="
        analysisState.analysis.value?.status === 'completed' &&
        analysisState.analysis.value.result
      "
    >
      <div class="ai-analysis-metrics">
        <div>
          <strong>{{ Math.round(analysisState.analysis.value.result.overallConfidence * 100) }}%</strong>
          <span>전체 신뢰도</span>
        </div>
        <div>
          <strong>{{ analysisState.analysis.value.result.confirmedFacts.length }}</strong>
          <span>확인된 사실</span>
        </div>
        <div>
          <strong>{{ analysisState.analysis.value.result.suspectedCauses.length }}</strong>
          <span>원인 후보</span>
        </div>
        <div>
          <strong>{{ analysisState.analysis.value.result.recommendedActions.length }}</strong>
          <span>권장 조치</span>
        </div>
        <div>
          <strong>{{ analysisState.analysis.value.result.additionalChecks.length }}</strong>
          <span>추가 확인</span>
        </div>
      </div>

      <article class="ai-analysis-section ai-analysis-summary-text">
        <h3>분석 요약</h3>
        <p>{{ analysisState.analysis.value.result.summary }}</p>
      </article>

      <article class="ai-analysis-section">
        <h3>확인된 사실</h3>
        <ul class="ai-fact-list">
          <li
            v-for="fact in analysisState.analysis.value.result.confirmedFacts"
            :key="fact.id"
          >
            <span aria-hidden="true">✓</span>
            <div>
              <p>{{ fact.description }}</p>
              <div class="evidence-links">
                <button
                  v-for="evidenceId in fact.evidenceIds"
                  :key="evidenceId"
                  type="button"
                  @click="selectEvidence(evidenceId)"
                >
                  근거 {{ evidenceId }}
                </button>
              </div>
            </div>
          </li>
        </ul>
      </article>

      <article class="ai-analysis-section">
        <h3>가능성 높은 원인</h3>
        <div class="ai-cause-list">
          <section
            v-for="cause in analysisState.analysis.value.result.suspectedCauses"
            :key="cause.id"
            class="ai-cause-card"
          >
            <header>
              <div>
                <span>{{ categoryLabels[cause.category] }}</span>
                <h4>{{ cause.title }}</h4>
              </div>
              <span
                class="confidence-badge"
                :class="`confidence--${confidenceTone(cause.confidence)}`"
              >
                {{ confidenceLabel(cause.confidence) }} · {{ Math.round(cause.confidence * 100) }}%
              </span>
            </header>
            <p>{{ cause.description }}</p>
            <dl>
              <div>
                <dt>확인 방법</dt>
                <dd>{{ cause.verificationMethod }}</dd>
              </div>
              <div>
                <dt>예상 확인 담당</dt>
                <dd>{{ roleLabels[cause.targetRole] }}</dd>
              </div>
            </dl>
            <div class="evidence-links">
              <button
                v-for="evidenceId in cause.evidenceIds"
                :key="evidenceId"
                type="button"
                @click="selectEvidence(evidenceId)"
              >
                근거 {{ evidenceId }}
              </button>
              <button
                v-for="evidenceId in cause.counterEvidenceIds"
                :key="`counter-${evidenceId}`"
                type="button"
                class="evidence-link--counter"
                @click="selectEvidence(evidenceId)"
              >
                반대 근거 {{ evidenceId }}
              </button>
            </div>
          </section>
        </div>
      </article>

      <article class="ai-analysis-section">
        <h3>재현 절차</h3>
        <ol class="ai-reproduction-list">
          <li
            v-for="step in analysisState.analysis.value.result.reproductionSteps"
            :key="step.order"
            :class="{ 'ai-reproduction-list__failure': step.isFailurePoint }"
          >
            <span>{{ step.isFailurePoint ? "!" : step.order }}</span>
            <p>
              {{ step.description }}
              <strong v-if="step.isFailurePoint">실패 지점</strong>
            </p>
          </li>
        </ol>
      </article>

      <article class="ai-analysis-section">
        <h3>권장 조치</h3>
        <div class="ai-action-list">
          <section
            v-for="action in analysisState.analysis.value.result.recommendedActions"
            :key="action.id"
          >
            <span :class="`priority--${action.priority}`">
              {{ priorityLabels[action.priority] }}
            </span>
            <div>
              <h4>{{ action.title }}</h4>
              <p>{{ action.description }}</p>
              <small>예상 확인 담당 · {{ roleLabels[action.targetRole] }}</small>
            </div>
          </section>
        </div>
      </article>

      <article class="ai-analysis-section">
        <h3>추가 확인 사항</h3>
        <el-checkbox-group v-model="checkedItems" class="ai-check-list">
          <el-checkbox
            v-for="check in analysisState.analysis.value.result.additionalChecks"
            :key="check.id"
            :value="check.id"
          >
            <span>
              <strong>{{ check.question }}</strong>
              <small>{{ check.reason }}</small>
            </span>
          </el-checkbox>
        </el-checkbox-group>
      </article>

      <article
        v-if="analysisState.analysis.value.result.limitations.length"
        class="ai-analysis-section ai-limitations"
      >
        <h3>분석 한계</h3>
        <ul>
          <li
            v-for="limitation in analysisState.analysis.value.result.limitations"
            :key="limitation"
          >
            {{ limitation }}
          </li>
        </ul>
      </article>
    </template>
  </section>
</template>
