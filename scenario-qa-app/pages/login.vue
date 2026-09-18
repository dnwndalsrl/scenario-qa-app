<script setup lang="ts">
import { useAuthSession } from "~/composables/useAuthSession";

definePageMeta({ layout: false });
const config = useRuntimeConfig(); const route = useRoute(); const email = ref(""); const password = ref(""); const loading = ref(false); const error = ref(""); const message = ref("");
const fieldErrors = reactive({ email: "", password: "" }); const session = useAuthSession(); const { $api } = useNuxtApp();
const reviewerEmail = computed(() => String(config.public.reviewerEmail || "").trim()); const reviewerPassword = computed(() => String(config.public.reviewerPassword || ""));
const reviewerAccountAvailable = computed(() => Boolean(reviewerEmail.value && reviewerPassword.value));
function fillReviewerAccount() { email.value = reviewerEmail.value; password.value = reviewerPassword.value; fieldErrors.email = ""; fieldErrors.password = ""; }
function validate() { fieldErrors.email = email.value.trim() ? "" : "이메일을 입력하세요."; fieldErrors.password = password.value ? "" : "비밀번호를 입력하세요."; return !fieldErrors.email && !fieldErrors.password; }
async function submit(kind: "login" | "signup") {
  error.value = ""; message.value = ""; if (!validate()) return; loading.value = true;
  try {
    const result = await $api<{ confirmationRequired?: boolean; user?: { id: string; email?: string } }>(`/api/auth/${kind}`, { method: "POST", body: { email: email.value, password: password.value } });
    if (kind === "signup" && result.confirmationRequired) message.value = "인증 메일을 확인한 뒤 로그인해 주세요.";
    else { session.value = { authenticated: true, user: result.user ?? null }; await navigateTo(typeof route.query.redirect === "string" ? route.query.redirect : "/"); }
  } catch (cause: any) { error.value = cause?.data?.statusMessage || cause?.message || "이메일 또는 비밀번호를 확인하세요."; }
  finally { loading.value = false; }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-card" aria-labelledby="login-title">
      <NuxtLink class="auth-mark" to="/" aria-label="Probe QA 홈">P</NuxtLink>
      <div class="auth-heading"><h1 id="login-title">Probe QA에 로그인</h1><p>URL 기반 QA 작업 공간에 접근합니다.</p></div>
      <form novalidate @submit.prevent="submit('login')">
        <label for="login-email">이메일</label><input id="login-email" v-model="email" type="email" autocomplete="email" :aria-invalid="Boolean(fieldErrors.email)"><p v-if="fieldErrors.email" class="field-error"><span>✕</span>{{ fieldErrors.email }}</p>
        <label for="login-password">비밀번호</label><input id="login-password" v-model="password" type="password" autocomplete="current-password" :aria-invalid="Boolean(fieldErrors.password)"><p v-if="fieldErrors.password" class="field-error"><span>✕</span>{{ fieldErrors.password }}</p>
        <button class="primary-button" :disabled="loading">로그인</button>
      </form>
      <div v-if="error" class="form-error" role="alert"><span aria-hidden="true">✕</span><div><strong>로그인에 실패했습니다</strong><p>{{ error }}</p></div></div>
      <div v-if="message" class="form-error" role="status"><span aria-hidden="true">○</span><div><strong>이메일을 확인하세요</strong><p>{{ message }}</p></div></div>
      <aside v-if="reviewerAccountAvailable" class="reviewer-account" aria-labelledby="reviewer-account-title"><button type="button" @click="fillReviewerAccount">심사용 계정으로 채우기 →</button><p id="reviewer-account-title">심사용 계정</p><dl><div><dt>이메일</dt><dd>{{ reviewerEmail }}</dd></div><div><dt>비밀번호</dt><dd>{{ reviewerPassword }}</dd></div></dl></aside>
      <button v-if="config.public.signupEnabled" class="secondary-button" :disabled="loading" @click="submit('signup')">신규 계정 만들기</button>
    </section>
    <footer><span>Probe QA</span><i>|</i><span>v1.4</span><i>|</i><span>이용 안내</span></footer>
  </main>
</template>

<style scoped>
.auth-page{position:relative;display:grid;min-width:1440px;min-height:900px;place-items:center;background:var(--bg)}.auth-card{display:flex;width:400px;flex-direction:column;gap:28px}.auth-mark{display:grid;width:40px;height:40px;place-items:center;align-self:center;border-radius:10px;background:var(--ink);color:var(--bg);font-weight:var(--fw-semibold)}.auth-heading{text-align:center}.auth-heading h1{margin:0;font-size:var(--fs-h1);line-height:var(--lh-h1);font-weight:var(--fw-semibold)}.auth-heading p{margin:8px 0 0;color:var(--text-3)}form{display:grid;gap:6px}form label{margin-top:10px;font-size:var(--fs-small);font-weight:var(--fw-medium)}form input{height:40px;padding:0 12px;border:1px solid var(--border);border-radius:var(--r-field);font:inherit;outline:none}form input:focus,form input[aria-invalid="true"]{border-color:var(--ink)}form .primary-button{width:100%;margin-top:14px}.field-error{display:flex;gap:6px;margin:0;color:var(--ink);font-size:var(--fs-meta);font-weight:var(--fw-medium)}.field-error span,.form-error>span{font-family:var(--font-mono)}.form-error{display:grid;grid-template-columns:auto 1fr;gap:10px;padding:12px 14px;border:1px solid var(--ink);border-radius:var(--r-field)}.form-error strong{font-size:var(--fs-small);font-weight:var(--fw-semibold)}.form-error p{margin:2px 0 0;color:var(--text-2);font-size:var(--fs-small)}.reviewer-account{position:relative;padding:16px;border-radius:var(--r-card);background:var(--surface)}.reviewer-account>button{position:absolute;top:16px;right:16px;border:0;background:none;font:inherit;font-size:var(--fs-meta);font-weight:var(--fw-medium);cursor:pointer}.reviewer-account>p{margin:0 0 12px;color:var(--text-4);font-size:var(--fs-meta)}.reviewer-account dl{display:grid;gap:6px;margin:0}.reviewer-account dl div{display:grid;grid-template-columns:70px 1fr}.reviewer-account dt{color:var(--text-3);font-size:var(--fs-meta)}.reviewer-account dd{margin:0;font-family:var(--font-mono);font-size:var(--fs-small)}.secondary-button{width:100%}.auth-page>footer{position:absolute;bottom:20px;display:flex;gap:10px;color:var(--text-4);font-size:var(--fs-meta);font-style:normal}.auth-page>footer i{font-style:normal}
</style>
