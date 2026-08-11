<script setup lang="ts">
interface SubmitPayload { url: string; document?: File }
const emit = defineEmits<{ submit: [payload: SubmitPayload] }>();
defineProps<{ loading?: boolean }>();
const url = ref("");
const error = ref("");
const document = ref<File>();

function selectDocument(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  error.value = "";
  if (!file) { document.value = undefined; return; }
  if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) {
    error.value = "10MB 이하의 PDF 파일만 등록할 수 있습니다.";
    (event.target as HTMLInputElement).value = "";
    return;
  }
  document.value = file;
}
function submit() {
  error.value = "";
  try { const parsed = new URL(url.value.trim()); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); }
  catch { error.value = "http:// 또는 https://로 시작하는 올바른 URL을 입력해 주세요."; return; }
  emit("submit", { url: url.value.trim(), document: document.value });
}
</script>

<template>
  <form class="analysis-form card" @submit.prevent="submit">
    <label class="field-label" for="analysis-url">테스트할 페이지 URL</label>
    <div class="url-row"><input id="analysis-url" v-model="url" class="url-input" type="url" inputmode="url" autocomplete="url" placeholder="https://example.com" data-testid="analysis-url-input"><button class="primary-button" type="submit" :disabled="loading" data-testid="start-analysis-button">{{ loading ? "분석을 준비하는 중…" : "1단계 분석 시작" }}</button></div>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
    <label class="document-upload" for="requirements-pdf"><strong>기획서·요구사항 PDF <span>선택</span></strong><small>템플릿은 필수가 아닙니다. 자유 형식 PDF의 QA 적합도와 빠진 정보를 먼저 판단합니다. 최대 10MB</small><input id="requirements-pdf" type="file" accept="application/pdf,.pdf" @change="selectDocument"><em v-if="document">{{ document.name }}</em></label>
  </form>
</template>
