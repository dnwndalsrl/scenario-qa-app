<script setup lang="ts">
import type { AnalysisMode } from "~/shared/types/analysis";
interface SubmitPayload { url: string; document?: File; options: { mode: AnalysisMode; maxPages: number; maxDepth: number } }
const emit = defineEmits<{ submit: [payload: SubmitPayload] }>();
defineProps<{ loading?: boolean }>();
const url = ref("");
const error = ref("");
const mode = ref<AnalysisMode>("single_page");
const maxPages = ref(3);
const maxDepth = ref(1);
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
  emit("submit", { url: url.value.trim(), document: document.value, options: { mode: mode.value, maxPages: maxPages.value, maxDepth: maxDepth.value } });
}
</script>

<template>
  <form class="analysis-form card" @submit.prevent="submit">
    <label class="field-label" for="analysis-url">테스트할 페이지 URL</label>
    <div class="url-row"><input id="analysis-url" v-model="url" class="url-input" type="url" inputmode="url" autocomplete="url" placeholder="https://example.com" data-testid="analysis-url-input"><button class="primary-button" type="submit" :disabled="loading" data-testid="start-analysis-button">{{ loading ? "분석을 준비하는 중…" : "1단계 분석 시작" }}</button></div>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
    <label class="document-upload" for="requirements-pdf"><strong>기획서·요구사항 PDF <span>선택</span></strong><small>PDF가 있으면 요구사항을 먼저 분석합니다. 최대 10MB</small><input id="requirements-pdf" type="file" accept="application/pdf,.pdf" @change="selectDocument"><em v-if="document">{{ document.name }}</em></label>
    <fieldset class="scope-picker"><legend>분석 범위</legend><label :class="{ selected: mode === 'single_page' }"><input v-model="mode" type="radio" value="single_page"> 현재 페이지 1개</label><label :class="{ selected: mode === 'site_crawl' }"><input v-model="mode" type="radio" value="site_crawl"> 동일 사이트 주요 페이지</label></fieldset>
    <div v-if="mode === 'site_crawl'" class="crawl-options">
      <label>최대 분석 페이지<input v-model.number="maxPages" class="number-input" type="number" min="1" max="5"></label><label>최대 탐색 깊이<input v-model.number="maxDepth" class="number-input" type="number" min="0" max="2"></label>
      <p>페이지 분석이 끝나면 시나리오 검토 단계에서 직접 수정하거나 추가한 뒤 테스트를 실행합니다.</p>
    </div>
    <div class="option-grid"><div class="option"><strong>1. 선택 문서 분석</strong><span>PDF 요구사항을 테스트 가능한 조건으로 구조화합니다.</span></div><div class="option"><strong>2. 시나리오 검토</strong><span>페이지 분석 후 자동 실행하지 않고 사용자의 확정을 기다립니다.</span></div></div>
    <div class="notice"><span aria-hidden="true">!</span><span>3단계 테스트는 확정 버튼을 누른 뒤 실행됩니다. 결제·삭제·계정 변경 등 위험 동작은 자동 실행하지 않습니다.</span></div>
  </form>
</template>
