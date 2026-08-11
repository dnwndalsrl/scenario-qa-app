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
    <header class="analysis-form__head">
      <div><span>새 분석</span><h2>분석할 대상을 등록하세요</h2><p>URL은 필수이며, 기획 문서는 필요한 경우에만 첨부하면 됩니다.</p></div>
      <div class="scope-chip"><i aria-hidden="true" />현재 페이지 1개</div>
    </header>
    <div class="analysis-targets">
      <section class="input-block">
        <div class="input-block__head"><label for="analysis-url">테스트할 페이지 URL</label><span>필수</span></div>
        <div class="url-control"><span class="url-control__icon" aria-hidden="true">↗</span><input id="analysis-url" v-model="url" class="url-input" type="url" inputmode="url" autocomplete="url" placeholder="https://example.com" data-testid="analysis-url-input"><button class="primary-button" type="submit" :disabled="loading" data-testid="start-analysis-button"><span>{{ loading ? "분석을 준비하는 중…" : "분석 시작" }}</span><span aria-hidden="true">→</span></button></div>
      </section>
      <section class="input-block">
        <div class="input-block__head"><span>기획서·요구사항</span><span>선택 · PDF 10MB 이하</span></div>
        <label class="document-upload" :class="{ selected: document }" for="requirements-pdf">
          <span class="document-upload__icon" aria-hidden="true">PDF</span>
          <span class="document-upload__copy"><strong>{{ document?.name || "요구사항 문서를 함께 분석할까요?" }}</strong><small>{{ document ? "선택한 문서를 페이지 분석에 함께 반영합니다." : "자유 형식 PDF도 가능하며, 문서가 없어도 페이지 분석을 시작할 수 있습니다." }}</small></span>
          <span class="document-upload__action">{{ document ? "파일 변경" : "PDF 선택" }}</span>
          <input id="requirements-pdf" type="file" accept="application/pdf,.pdf" @change="selectDocument">
        </label>
      </section>
    </div>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
  </form>
</template>
