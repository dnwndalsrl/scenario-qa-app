<script setup lang="ts">
import type { AnalysisAuthenticationInput } from "../../shared/types/authentication";

interface SubmitPayload { url: string; document?: File; authentication?: AnalysisAuthenticationInput }
const emit = defineEmits<{ submit: [payload: SubmitPayload] }>();
defineProps<{ loading?: boolean }>();
const url = ref("");
const error = ref("");
const document = ref<File>();
const authenticationEnabled = ref(false);
const loginUrl = ref("");
const username = ref("");
const password = ref("");
const settingsOpen = ref(false);

function openSettings() {
  error.value = "";
  try { const target = new URL(url.value.trim()); if (!["http:", "https:"].includes(target.protocol)) throw new Error(); settingsOpen.value = true; }
  catch { error.value = "http:// 또는 https://로 시작하는 올바른 URL을 입력해 주세요."; }
}

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
  try { target = new URL(url.value.trim()); if (!["http:", "https:"].includes(target.protocol)) throw new Error(); }
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
  <form class="analysis-form card" novalidate @submit.prevent="submit">
    <div class="url-composer">
      <div class="url-control"><input id="analysis-url" v-model="url" class="url-input" type="url" inputmode="url" autocomplete="url" placeholder="https://example.com" :readonly="settingsOpen" data-testid="analysis-url-input"><button v-if="settingsOpen" class="url-change" type="button" @click="settingsOpen = false">URL 변경</button><button v-else class="primary-button" type="button" data-testid="start-analysis-button" @click="openSettings">분석 시작 →</button></div>
    </div>
    <div v-if="settingsOpen" class="analysis-targets settings-panel">
      <header><div><h2>기능 QA 설정</h2><p>선택 문서와 로그인 여부를 확인한 뒤 분석을 실행합니다.</p></div><span>현재 페이지 1개</span></header>
      <section class="input-block">
        <div class="input-block__head"><span>기획서·요구사항</span><span>선택 · PDF 10MB 이하</span></div>
        <label class="document-upload" :class="{ selected: document }" for="requirements-pdf">
          <span class="document-upload__icon" aria-hidden="true">PDF</span>
          <span class="document-upload__copy"><strong>{{ document?.name || "요구사항 문서를 함께 분석할까요?" }}</strong><small>{{ document ? "선택한 문서를 페이지 분석에 함께 반영합니다." : "자유 형식 PDF도 가능하며, 문서가 없어도 페이지 분석을 시작할 수 있습니다." }}</small></span>
          <span class="document-upload__action">{{ document ? "파일 변경" : "PDF 선택" }}</span>
          <input id="requirements-pdf" type="file" accept="application/pdf,.pdf" @change="selectDocument">
        </label>
      </section>
      <section class="input-block authentication-block">
        <label class="authentication-toggle"><input v-model="authenticationEnabled" type="checkbox"><span><strong>로그인이 필요한 페이지</strong><small>동일 사이트의 일반 아이디·비밀번호 로그인만 지원합니다.</small></span><b>{{ authenticationEnabled ? "사용" : "사용 안 함" }}</b></label>
        <div v-if="authenticationEnabled" class="authentication-fields">
          <label><span>로그인 페이지 URL</span><input v-model="loginUrl" type="url" inputmode="url" autocomplete="url" placeholder="https://example.com/login" required></label>
          <label><span>테스트 계정 아이디·이메일</span><input v-model="username" type="text" autocomplete="username" placeholder="qa@example.com" required></label>
          <label><span>테스트 계정 비밀번호</span><input v-model="password" type="password" autocomplete="current-password" placeholder="비밀번호 입력" required></label>
          <p><span aria-hidden="true">🔒</span> 계정 정보는 암호화해 저장하며 화면·보고서·로그에 표시하지 않습니다. 소셜 로그인, OTP, CAPTCHA는 지원하지 않습니다.</p>
        </div>
      </section>
      <footer class="settings-submit"><span>문서 분석 → 페이지 분석 → 시나리오 생성</span><button class="primary-button" type="submit" :disabled="loading">{{ loading ? "분석 준비 중" : "분석 실행" }}</button></footer>
    </div>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
  </form>
</template>
