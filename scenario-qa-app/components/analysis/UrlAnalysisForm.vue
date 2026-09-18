<script setup lang="ts">
import type { AnalysisAuthenticationInput } from "../../shared/types/authentication";

interface SubmitPayload { url: string; document?: File; authentication?: AnalysisAuthenticationInput }
const props = defineProps<{ loading?: boolean; url: string }>();
const emit = defineEmits<{ submit: [payload: SubmitPayload] }>();
const error = ref("");
const document = ref<File>();
const authenticationEnabled = ref(false);
const loginUrl = ref("");
const username = ref("");
const password = ref("");

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
  let target: URL;
  try { target = new URL(props.url.trim()); if (!["http:", "https:"].includes(target.protocol)) throw new Error(); }
  catch { error.value = "http:// 또는 https://로 시작하는 올바른 URL을 입력해 주세요."; return; }
  let authentication: AnalysisAuthenticationInput | undefined;
  if (authenticationEnabled.value) {
    let login: URL;
    try { login = new URL(loginUrl.value.trim()); if (!["http:", "https:"].includes(login.protocol)) throw new Error(); }
    catch { error.value = "올바른 로그인 페이지 URL을 입력해 주세요."; return; }
    if (login.origin !== target.origin) { error.value = "보안을 위해 로그인 주소와 테스트 URL은 같은 사이트여야 합니다."; return; }
    if (!username.value.trim() || !password.value) { error.value = "테스트 계정의 아이디와 비밀번호를 입력해 주세요."; return; }
    authentication = { loginUrl: login.toString(), username: username.value.trim(), password: password.value };
  }
  emit("submit", { url: target.toString(), document: document.value, authentication });
}
</script>

<template>
  <form class="qa-settings" novalidate @submit.prevent="submit">
    <header><strong>실행 전 설정</strong><span>모두 선택 사항 · 그대로 실행해도 됩니다</span></header>
    <div class="qa-settings__grid">
      <section class="qa-option-card">
        <div class="qa-option-card__title"><strong>기획서·요구사항</strong><span>선택 · PDF 10MB 이하</span></div>
        <p>있으면 요구사항을 테스트 가능한 조건으로 정리하고, 없으면 페이지 분석만 진행합니다.</p>
        <div class="qa-file-picker"><label for="requirements-pdf">PDF 선택</label><span>{{ document?.name || "선택한 파일 없음" }}</span><input id="requirements-pdf" type="file" accept="application/pdf,.pdf" @change="selectDocument"></div>
      </section>
      <section class="qa-option-card">
        <div class="qa-option-card__title"><strong>로그인이 필요한 페이지</strong><span>선택 · 아이디·비밀번호만</span></div>
        <p>동일 사이트의 일반 로그인만 지원합니다. 소셜·2단계 인증은 지원하지 않습니다.</p>
        <label class="qa-check"><input v-model="authenticationEnabled" type="checkbox">로그인 후 분석</label>
      </section>
      <div v-if="authenticationEnabled" class="qa-auth-fields">
        <label><span>로그인 페이지 URL</span><input v-model="loginUrl" type="url" autocomplete="url" placeholder="https://example.com/login"></label>
        <label><span>테스트 계정 아이디·이메일</span><input v-model="username" type="text" autocomplete="username" placeholder="qa@example.com"></label>
        <label><span>테스트 계정 비밀번호</span><input v-model="password" type="password" autocomplete="current-password" placeholder="비밀번호 입력"></label>
        <p>계정 정보는 암호화해 저장하며 화면·보고서·로그에 표시하지 않습니다.</p>
      </div>
    </div>
    <footer class="qa-settings__submit"><div><strong>기능 QA · {{ document ? '문서 선택' : '문서 없음' }} · {{ authenticationEnabled ? '로그인 사용' : '로그인 없음' }}</strong><span>1 선택 문서 분석 → 2 페이지·시나리오 분석 → 3 확정 시나리오 실행</span></div><button class="primary-button" type="submit" :disabled="loading">{{ loading ? "분석 준비 중" : "분석 실행" }}</button></footer>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
  </form>
</template>
