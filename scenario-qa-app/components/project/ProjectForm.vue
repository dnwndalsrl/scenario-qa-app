<script setup lang="ts">

const props = withDefaults(
  defineProps<{
    initialValue?: ProjectInput;
    pending?: boolean;
    submitLabel?: string;
  }>(),
  {
    initialValue: () => ({
      name: "",
      description: "",
      baseUrl: "",
      environmentName: "local",
      defaultTimeout: 15000,
      stopOnFailure: true
    }),
    pending: false,
    submitLabel: "프로젝트 저장"
  }
);

const emit = defineEmits<{
  submit: [value: ProjectInput];
  cancel: [];
}>();

const form = reactive<ProjectInput>({ ...props.initialValue });
const error = ref<string | null>(null);

watch(
  () => props.initialValue,
  (value) => Object.assign(form, value),
  { deep: true }
);

function submit(): void {
  error.value = validate();
  if (error.value !== null) {
    return;
  }
  const description = form.description?.trim();
  emit("submit", {
    ...form,
    name: form.name.trim(),
    ...(description === undefined || description.length === 0
      ? {}
      : { description }),
    baseUrl: form.baseUrl.trim(),
    environmentName: form.environmentName.trim()
  });
}

function validate(): string | null {
  if (form.name.trim().length === 0) {
    return "프로젝트명을 입력해 주세요.";
  }
  if (form.baseUrl.trim().length === 0) {
    return "기본 URL을 입력해 주세요.";
  }
  try {
    const url = new URL(form.baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "기본 URL은 HTTP 또는 HTTPS여야 합니다.";
    }
  } catch {
    return "올바른 기본 URL을 입력해 주세요.";
  }
  if (form.environmentName.trim().length === 0) {
    return "테스트 환경 이름을 입력해 주세요.";
  }
  if (form.defaultTimeout < 1000 || form.defaultTimeout > 300000) {
    return "기본 제한 시간은 1,000~300,000ms여야 합니다.";
  }
  return null;
}
</script>

<template>
  <el-form label-position="top" class="form-panel" @submit.prevent="submit">
    <div class="form-grid">
      <el-form-item label="프로젝트명" required>
        <el-input v-model="form.name" maxlength="100" show-word-limit />
      </el-form-item>
      <el-form-item label="테스트 환경 이름" required>
        <el-input v-model="form.environmentName" placeholder="local" />
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
    <el-form-item label="기본 URL" required>
      <el-input v-model="form.baseUrl" placeholder="http://localhost:3000" />
    </el-form-item>
    <div class="form-grid">
      <el-form-item label="기본 제한 시간(ms)" required>
        <el-input-number
          v-model="form.defaultTimeout"
          :min="1000"
          :max="300000"
          :step="1000"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item label="테스트 실패 시">
        <el-switch
          v-model="form.stopOnFailure"
          active-text="이후 단계 중단"
          inactive-text="계속 실행"
        />
      </el-form-item>
    </div>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
    />
    <div class="form-actions">
      <el-button :disabled="pending" @click="emit('cancel')">취소</el-button>
      <el-button type="primary" native-type="submit" :loading="pending">
        {{ submitLabel }}
      </el-button>
    </div>
  </el-form>
</template>
