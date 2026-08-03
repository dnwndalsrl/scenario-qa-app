<script setup lang="ts">

const props = withDefaults(
  defineProps<{
    initialValue: ScenarioInput;
    pending?: boolean;
    submitLabel?: string;
  }>(),
  {
    pending: false,
    submitLabel: "시나리오 저장"
  }
);

const emit = defineEmits<{
  submit: [value: ScenarioInput];
  cancel: [];
}>();

const form = reactive<ScenarioInput>(structuredClone(props.initialValue));
const validationMessages = ref<string[]>([]);

watch(
  () => props.initialValue,
  (value) => Object.assign(form, structuredClone(value)),
  { deep: true }
);

function submit(): void {
  const normalizedSteps = form.steps.map(normalizeSensitiveStep);
  const description = form.description?.trim();
  const value: ScenarioInput = {
    name: form.name.trim(),
    ...(description === undefined || description.length === 0
      ? {}
      : { description }),
    startUrl: form.startUrl.trim(),
    stopOnFailure: form.stopOnFailure,
    timeout: form.timeout,
    steps: normalizedSteps
  };
  const issues = validateScenarioInput(value);
  validationMessages.value = issues.map((issue) => issue.message);
  if (issues.length === 0) {
    emit("submit", value);
  }
}

function normalizeSensitiveStep(step: TestStep): TestStep {
  if (step.action !== "fill") {
    return step;
  }
  const sensitive =
    step.sensitive === true ||
    /\{\{[^}]*(?:PASSWORD|TOKEN|SECRET|AUTH|COOKIE)[^}]*\}\}/i.test(
      step.value ?? ""
    );
  return { ...step, sensitive };
}
</script>

<template>
  <el-form label-position="top" class="scenario-form" @submit.prevent="submit">
    <section class="form-panel">
      <div class="form-grid">
        <el-form-item label="시나리오 이름" required>
          <el-input v-model="form.name" maxlength="120" show-word-limit />
        </el-form-item>
        <el-form-item label="시작 경로 또는 URL" required>
          <el-input v-model="form.startUrl" placeholder="/login" />
        </el-form-item>
      </div>
      <el-form-item label="설명">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          maxlength="500"
        />
      </el-form-item>
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

    <ScenarioStepEditor v-model="form.steps" />

    <el-alert
      v-if="validationMessages.length > 0"
      type="error"
      show-icon
      :closable="false"
    >
      <ul class="validation-list">
        <li v-for="message in validationMessages" :key="message">
          {{ message }}
        </li>
      </ul>
    </el-alert>

    <div class="form-actions form-actions--sticky">
      <el-button :disabled="pending" @click="emit('cancel')">취소</el-button>
      <el-button type="primary" native-type="submit" :loading="pending">
        {{ submitLabel }}
      </el-button>
    </div>
  </el-form>
</template>
