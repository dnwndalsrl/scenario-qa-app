<script setup lang="ts">
import {
  LOCATOR_STRATEGIES,
  TEST_ACTION_LABELS,
  TEST_ACTIONS
} from "../../constants/test-action";

const props = defineProps<{
  step: TestStep;
  index: number;
  total: number;
}>();

const emit = defineEmits<{
  "update:step": [step: TestStep];
  remove: [];
  copy: [];
  "move-up": [];
  "move-down": [];
}>();

const usesTarget = computed(() =>
  ["fill", "click", "assert_visible"].includes(props.step.action)
);
const usesValue = computed(() =>
  ["goto", "fill"].includes(props.step.action)
);
const isSensitiveReference = computed(
  () =>
    props.step.action === "fill" &&
    /\{\{[^}]*(?:PASSWORD|TOKEN|SECRET|AUTH|COOKIE)[^}]*\}\}/i.test(
      props.step.value ?? ""
    )
);

function patchStep(patch: Partial<TestStep>): void {
  emit("update:step", { ...props.step, ...patch });
}

function changeAction(value: string): void {
  if (!TEST_ACTIONS.includes(value as TestAction)) {
    return;
  }
  const action = value as TestAction;
  const next: TestStep = {
    id: props.step.id,
    order: props.step.order,
    name: props.step.name,
    action,
    timeout: props.step.timeout,
    required: props.step.required
  };
  if (action === "goto" || action === "fill") {
    next.value = "";
  }
  if (action === "fill" || action === "click" || action === "assert_visible") {
    next.target = { strategy: "testId", value: "" };
  }
  if (action === "assert_url") {
    next.expected = { operator: "contains", value: "" };
  }
  emit("update:step", next);
}

function patchTarget(patch: Partial<ElementTarget>): void {
  const current = props.step.target ?? {
    strategy: "testId" as const,
    value: ""
  };
  patchStep({ target: { ...current, ...patch } });
}

function patchExpected(patch: {
  operator?: UrlOperator;
  value?: string;
}): void {
  patchStep({
    expected: {
      operator: props.step.expected?.operator ?? "contains",
      value: props.step.expected?.value ?? "",
      ...patch
    }
  });
}
</script>

<template>
  <article class="step-editor-item">
    <header class="step-editor-item__header">
      <div class="step-number">{{ index + 1 }}</div>
      <div class="step-editor-item__title">
        <strong>{{ step.name || "이름 없는 단계" }}</strong>
        <span>{{ TEST_ACTION_LABELS[step.action] }}</span>
      </div>
      <div class="step-editor-item__controls">
        <el-button
          text
          aria-label="위로 이동"
          :disabled="index === 0"
          @click="emit('move-up')"
        >
          ↑
        </el-button>
        <el-button
          text
          aria-label="아래로 이동"
          :disabled="index === total - 1"
          @click="emit('move-down')"
        >
          ↓
        </el-button>
        <el-button text @click="emit('copy')">복사</el-button>
        <el-button text type="danger" @click="emit('remove')">삭제</el-button>
      </div>
    </header>

    <div class="step-editor-item__body">
      <div class="form-grid form-grid--three">
        <el-form-item label="단계명" required>
          <el-input
            :model-value="step.name"
            @update:model-value="patchStep({ name: String($event) })"
          />
        </el-form-item>
        <el-form-item label="액션" required>
          <el-select
            :model-value="step.action"
            @change="changeAction(String($event))"
          >
            <el-option
              v-for="action in TEST_ACTIONS"
              :key="action"
              :label="TEST_ACTION_LABELS[action]"
              :value="action"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Timeout(ms)" required>
          <el-input-number
            :model-value="step.timeout"
            :min="1000"
            :max="300000"
            :step="1000"
            controls-position="right"
            @update:model-value="
              patchStep({ timeout: Number($event ?? step.timeout) })
            "
          />
        </el-form-item>
      </div>

      <div v-if="usesTarget" class="form-grid form-grid--three">
        <el-form-item label="탐색 전략" required>
          <el-select
            :model-value="step.target?.strategy ?? 'testId'"
            @change="
              patchTarget({
                strategy: String($event) as ElementTarget['strategy']
              })
            "
          >
            <el-option
              v-for="strategy in LOCATOR_STRATEGIES"
              :key="strategy"
              :label="strategy"
              :value="strategy"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="대상 값" required>
          <el-input
            :model-value="step.target?.value ?? ''"
            placeholder="login-submit"
            @update:model-value="patchTarget({ value: String($event) })"
          />
        </el-form-item>
        <el-form-item
          v-if="step.target?.strategy === 'role'"
          label="접근 가능한 이름"
        >
          <el-input
            :model-value="step.target?.name ?? ''"
            placeholder="로그인"
            @update:model-value="patchTarget({ name: String($event) })"
          />
        </el-form-item>
      </div>

      <el-form-item
        v-if="usesValue"
        :label="step.action === 'goto' ? '이동 URL' : '입력값'"
        required
      >
        <el-input
          :model-value="step.value ?? ''"
          :placeholder="
            step.action === 'goto' ? '/login' : '{{TEST_LOGIN_ID}}'
          "
          @update:model-value="patchStep({ value: String($event) })"
        />
        <p v-if="isSensitiveReference" class="field-help field-help--safe">
          민감한 환경변수는 실행 결과에서 ••••••••로 표시됩니다.
        </p>
      </el-form-item>

      <div v-if="step.action === 'assert_url'" class="form-grid">
        <el-form-item label="비교 방식" required>
          <el-select
            :model-value="step.expected?.operator ?? 'contains'"
            @change="
              patchExpected({
                operator: String($event) as UrlOperator
              })
            "
          >
            <el-option label="정확히 일치" value="equals" />
            <el-option label="문자열 포함" value="contains" />
          </el-select>
        </el-form-item>
        <el-form-item label="예상 URL" required>
          <el-input
            :model-value="step.expected?.value ?? ''"
            placeholder="/dashboard"
            @update:model-value="patchExpected({ value: String($event) })"
          />
        </el-form-item>
      </div>

      <el-form-item label="단계 실패 정책">
        <el-switch
          :model-value="step.required"
          active-text="필수 단계"
          inactive-text="선택 단계"
          @update:model-value="patchStep({ required: Boolean($event) })"
        />
      </el-form-item>
    </div>
  </article>
</template>
