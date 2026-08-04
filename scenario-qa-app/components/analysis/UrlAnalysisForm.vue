<script setup lang="ts">
import type { AnalysisMode } from "~/shared/types/analysis";
interface SubmitPayload { url: string; options: { mode: AnalysisMode; maxPages: number; maxDepth: number; includeQueryUrls: boolean; autoRunSafeTests: boolean } }
const emit = defineEmits<{ submit: [payload: SubmitPayload] }>();
const url = ref(""); const error = ref(""); const mode = ref<AnalysisMode>("single_page"); const maxPages = ref(3); const maxDepth = ref(1); const includeQueryUrls = ref(false); const autoRunSafeTests = ref(true);
function submit() {
  error.value = "";
  try { const parsed = new URL(url.value.trim()); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); }
  catch { error.value = "http:// 또는 https://로 시작하는 올바른 URL을 입력해 주세요."; return; }
  emit("submit", { url: url.value.trim(), options: { mode: mode.value, maxPages: maxPages.value, maxDepth: maxDepth.value, includeQueryUrls: includeQueryUrls.value, autoRunSafeTests: autoRunSafeTests.value } });
}
defineProps<{ loading?: boolean }>();
</script>

<template>
  <form class="analysis-form card" @submit.prevent="submit">
    <label class="field-label" for="analysis-url">테스트할 페이지 URL</label>
    <div class="url-row"><el-input id="analysis-url" v-model="url" size="large" placeholder="https://example.com" clearable data-testid="analysis-url-input" /><button class="primary-button" type="submit" :disabled="loading" data-testid="start-analysis-button">{{ loading ? "분석을 준비하는 중…" : "AI QA 분석 시작" }}</button></div>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
    <fieldset class="scope-picker"><legend>분석 범위</legend><label :class="{ selected: mode === 'single_page' }"><input v-model="mode" type="radio" value="single_page"> 현재 페이지 1개</label><label :class="{ selected: mode === 'site_crawl' }"><input v-model="mode" type="radio" value="site_crawl"> 동일 사이트 주요 페이지</label></fieldset>
    <div v-if="mode === 'site_crawl'" class="crawl-options">
      <label>최대 분석 페이지<el-input-number v-model="maxPages" :min="1" :max="5" /></label><label>최대 탐색 깊이<el-input-number v-model="maxDepth" :min="0" :max="2" /></label>
      <label class="switch-option">Query URL 포함<el-switch v-model="includeQueryUrls" /></label><label class="switch-option">안전한 테스트 자동 실행<el-switch v-model="autoRunSafeTests" /></label>
      <p>동일한 origin 안에서 최대 {{ maxPages }}개의 주요 페이지를 탐색합니다. 삭제, 결제, 로그아웃 등 위험 가능성이 있는 링크는 자동으로 제외됩니다.</p>
    </div>
    <div class="option-grid"><div class="option"><strong>읽기 전용 탐색</strong><span>로그인·등록·수정·삭제·결제 흐름은 실행하지 않습니다.</span></div><div class="option"><strong>권한 있는 사이트만</strong><span>사용자가 소유하거나 테스트 권한이 있는 사이트에서만 사용하세요.</span></div></div>
    <div class="notice"><span aria-hidden="true">ⓘ</span><span>분석 화면에는 개인정보가 포함될 수 있습니다. 민감한 페이지나 인증 정보가 포함된 URL은 입력하지 마세요.</span></div>
  </form>
</template>
