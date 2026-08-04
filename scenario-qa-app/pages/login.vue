<script setup lang="ts">
import { useAuthSession } from "~/composables/useAuthSession";

definePageMeta({ layout: false });
const config = useRuntimeConfig(); const route = useRoute(); const email = ref(""); const password = ref(""); const loading = ref(false); const error = ref(""); const message = ref("");
const session = useAuthSession();
async function submit(kind: "login" | "signup") {
  loading.value = true; error.value = ""; message.value = "";
  try {
    const result = await $fetch<{ confirmationRequired?: boolean; user?: { id: string; email?: string } }>(`/api/auth/${kind}`, { method: "POST", body: { email: email.value, password: password.value } });
    if (kind === "signup" && result.confirmationRequired) message.value = "인증 메일을 확인한 뒤 로그인해 주세요.";
    else { session.value = { authenticated: true, user: result.user ?? null }; await navigateTo(typeof route.query.redirect === "string" ? route.query.redirect : "/"); }
  } catch (cause: any) { error.value = cause?.data?.statusMessage || cause?.message || "요청에 실패했습니다."; }
  finally { loading.value = false; }
}
</script>
<template><main class="auth-page"><section class="card auth-card"><NuxtLink class="brand" to="/"><span class="brand__mark">P</span><span><strong>Probe QA</strong><small>Vercel + GitHub Actions + Supabase</small></span></NuxtLink><h1>로그인</h1><p class="muted">내 분석 요청과 비공개 QA 결과에 안전하게 접근합니다.</p><form @submit.prevent="submit('login')"><label class="field-label">이메일</label><input v-model="email" class="auth-input" type="email" autocomplete="email" required><label class="field-label">비밀번호</label><input v-model="password" class="auth-input" type="password" minlength="8" autocomplete="current-password" required><button class="primary-button" :disabled="loading">{{ loading ? '처리 중…' : '로그인' }}</button></form><button v-if="config.public.signupEnabled" class="secondary-button" :disabled="loading" @click="submit('signup')">신규 계정 만들기</button><div v-if="error" class="error-box">{{ error }}</div><div v-if="message" class="notice">{{ message }}</div></section></main></template>
<style scoped>
.auth-page{min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f7fb}.auth-card{width:min(440px,100%);padding:32px}.auth-card h1{margin-top:32px;font-size:40px}.auth-card form{display:grid;gap:10px;margin-top:24px}.auth-input{width:100%;min-height:48px;padding:0 14px;border:1px solid var(--line);border-radius:12px}.field-label{margin:8px 0 0}.secondary-button{width:100%;margin-top:12px;min-height:44px;border:1px solid var(--line);border-radius:12px;background:white;cursor:pointer}
</style>
