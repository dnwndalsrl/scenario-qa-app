<script setup lang="ts">
import { useAuthSession } from "~/composables/useAuthSession";

definePageMeta({ layout: false });
const config = useRuntimeConfig(); const route = useRoute(); const email = ref(""); const password = ref(""); const loading = ref(false); const error = ref(""); const message = ref("");
const session = useAuthSession();
const { $api } = useNuxtApp();
async function submit(kind: "login" | "signup") {
  loading.value = true; error.value = ""; message.value = "";
  try {
    const result = await $api<{ confirmationRequired?: boolean; user?: { id: string; email?: string } }>(`/api/auth/${kind}`, { method: "POST", body: { email: email.value, password: password.value } });
    if (kind === "signup" && result.confirmationRequired) message.value = "인증 메일을 확인한 뒤 로그인해 주세요.";
    else { session.value = { authenticated: true, user: result.user ?? null }; await navigateTo(typeof route.query.redirect === "string" ? route.query.redirect : "/"); }
  } catch (cause: any) { error.value = cause?.data?.statusMessage || cause?.message || "요청에 실패했습니다."; }
  finally { loading.value = false; }
}
</script>
<template><main class="auth-page"><section class="auth-frame"><div class="auth-context"><NuxtLink class="brand" to="/"><span class="brand__mark">P</span><span><strong>Probe QA</strong><small>Quality operations</small></span></NuxtLink><p class="eyebrow">QA workspace</p><h1>확인해야 할 품질을<br>한곳에서 관리하세요.</h1><p>URL 분석, UI 점검, 판정과 결함 추적을 안전한 작업 흐름으로 연결합니다.</p><ul><li>검증 가능한 근거 중심 결과</li><li>팀이 공유하기 쉬운 후속 조치</li><li>비공개 분석과 접근 제어</li></ul></div><section class="card auth-card" aria-labelledby="login-title"><p class="eyebrow">Secure access</p><h2 id="login-title">로그인</h2><p class="muted">분석 요청과 비공개 QA 결과에 접근합니다.</p><form @submit.prevent="submit('login')"><label class="field-label" for="login-email">이메일</label><input id="login-email" v-model="email" class="auth-input" type="email" autocomplete="email" required><label class="field-label" for="login-password">비밀번호</label><input id="login-password" v-model="password" class="auth-input" type="password" minlength="8" autocomplete="current-password" required><button class="primary-button" :disabled="loading">{{ loading ? '처리 중…' : '로그인' }}</button></form><button v-if="config.public.signupEnabled" class="secondary-button" :disabled="loading" @click="submit('signup')">신규 계정 만들기</button><div v-if="error" class="error-box" role="alert">{{ error }}</div><div v-if="message" class="notice" role="status">{{ message }}</div></section></section></main></template>
<style scoped>
.auth-page{min-height:100vh;display:grid;place-items:center;padding:32px;background:var(--canvas)}.auth-frame{display:grid;width:min(980px,100%);grid-template-columns:minmax(0,1fr) 420px;overflow:hidden;border:1px solid var(--line);border-radius:20px;background:#eaf1fb;box-shadow:var(--shadow-lg)}.auth-context{padding:56px;color:var(--ink)}.auth-context .brand{width:max-content;margin-bottom:72px}.auth-context h1{font-size:clamp(34px,4vw,48px)}.auth-context>p:not(.eyebrow){max-width:470px;color:var(--muted);line-height:1.7}.auth-context ul{display:grid;gap:12px;margin:30px 0 0;padding:0;list-style:none}.auth-context li{display:flex;gap:10px;font-size:13px;font-weight:700}.auth-context li::before{content:"✓";color:var(--safe)}.auth-card{width:100%;padding:46px 40px;border:0;border-left:1px solid var(--line);border-radius:0;box-shadow:none}.auth-card h2{font-size:32px}.auth-card form{display:grid;gap:10px;margin-top:28px}.auth-input{width:100%;min-height:48px;padding:0 14px;border:1px solid var(--line-strong);border-radius:10px;outline:none}.auth-input:focus{border-color:var(--brand);box-shadow:var(--focus-ring)}.field-label{margin:8px 0 0}.secondary-button{width:100%;margin-top:12px;min-height:44px;border:1px solid var(--line-strong);border-radius:10px;background:white;cursor:pointer}@media(max-width:760px){.auth-page{padding:16px}.auth-frame{grid-template-columns:1fr}.auth-context{padding:28px}.auth-context .brand{margin-bottom:36px}.auth-context ul{display:none}.auth-card{padding:32px 28px;border-top:1px solid var(--line);border-left:0}}@media(max-width:420px){.auth-context{padding:24px}.auth-context h1{font-size:30px}.auth-card{padding:28px 22px}}
</style>

