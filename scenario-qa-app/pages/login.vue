<script setup lang="ts">
import { useAuthSession } from "~/composables/useAuthSession";

definePageMeta({ layout: false });
const config = useRuntimeConfig(); const route = useRoute(); const email = ref(""); const password = ref(""); const loading = ref(false); const error = ref(""); const errorTitle = ref(""); const message = ref("");
const fieldErrors = reactive({ email: "", password: "" }); const session = useAuthSession(); const { $api } = useNuxtApp();
const reviewerEmail = computed(() => String(config.public.reviewerEmail || "").trim()); const reviewerPassword = computed(() => String(config.public.reviewerPassword || ""));
const reviewerAccountAvailable = computed(() => Boolean(reviewerEmail.value && reviewerPassword.value));
function fillReviewerAccount() { email.value = reviewerEmail.value; password.value = reviewerPassword.value; fieldErrors.email = ""; fieldErrors.password = ""; }
function validate() { fieldErrors.email = email.value.trim() ? "" : "이메일을 입력하세요."; fieldErrors.password = password.value ? "" : "비밀번호를 입력하세요."; return !fieldErrors.email && !fieldErrors.password; }
async function submit(kind: "login" | "signup") {
  error.value = ""; errorTitle.value = ""; message.value = ""; if (!validate()) return; loading.value = true;
  try {
    const result = await $api<{ confirmationRequired?: boolean; user?: { id: string; email?: string } }>(`/api/auth/${kind}`, { method: "POST", body: { email: email.value, password: password.value } });
    if (kind === "signup" && result.confirmationRequired) message.value = "인증 메일을 확인한 뒤 로그인해 주세요.";
    else { session.value = { authenticated: true, user: result.user ?? null }; await navigateTo(typeof route.query.redirect === "string" ? route.query.redirect : "/"); }
  } catch (cause: any) {
    errorTitle.value = kind === "login" ? "로그인 정보가 올바르지 않습니다" : "계정을 만들지 못했습니다";
    error.value = kind === "login" ? "이메일과 비밀번호를 다시 확인해 주세요." : cause?.data?.statusMessage || cause?.message || "잠시 후 다시 시도해 주세요.";
  }
  finally { loading.value = false; }
}
</script>

<template>
  <div class="auth-page">
    <main class="auth-main">
      <section class="auth-card" :class="{ 'auth-card--loading': loading }" aria-labelledby="login-title">
        <header class="auth-header">
          <NuxtLink class="auth-mark" to="/" aria-label="Probe QA 홈">P</NuxtLink>
          <div class="auth-heading"><h1 id="login-title">Probe QA에 로그인</h1><p>분석 요청과 비공개 QA 결과에 접근합니다.</p></div>
        </header>
        <form novalidate @submit.prevent="submit('login')">
          <div class="form-field"><label for="login-email">이메일</label><input id="login-email" v-model="email" type="email" placeholder="name@company.com" autocomplete="username" :aria-invalid="Boolean(fieldErrors.email)"><p v-if="fieldErrors.email" class="field-error"><span>✕</span>{{ fieldErrors.email }}</p></div>
          <div class="form-field"><div class="form-field__head"><label for="login-password">비밀번호</label><a href="#" @click.prevent>비밀번호를 잊으셨나요?</a></div><input id="login-password" v-model="password" type="password" placeholder="••••••••" autocomplete="current-password" :aria-invalid="Boolean(fieldErrors.password)"><p v-if="fieldErrors.password" class="field-error"><span>✕</span>{{ fieldErrors.password }}</p></div>
          <button class="primary-button" :disabled="loading">로그인</button>
          <div v-if="error" class="form-error" role="alert"><span aria-hidden="true">✕</span><div><strong>{{ errorTitle }}</strong><p>{{ error }}</p></div></div>
          <div v-if="message" class="form-error" role="status"><span aria-hidden="true">○</span><div><strong>이메일을 확인하세요</strong><p>{{ message }}</p></div></div>
        </form>
        <aside v-if="reviewerAccountAvailable" class="reviewer-account" aria-labelledby="reviewer-account-title"><div class="reviewer-account__head"><strong id="reviewer-account-title">심사용 계정</strong><button type="button" @click="fillReviewerAccount">심사용 계정으로 채우기 →</button></div><dl><div><dt>이메일</dt><dd>{{ reviewerEmail }}</dd></div><div><dt>비밀번호</dt><dd>{{ reviewerPassword }}</dd></div></dl><p>심사 기간에만 제공되는 공용 계정입니다. 외부에 공유하지 마세요.</p></aside>
        <button v-if="config.public.signupEnabled" class="secondary-button" :disabled="loading" @click="submit('signup')">신규 계정 만들기</button>
      </section>
    </main>
    <footer><span>Probe QA</span><i aria-hidden="true"></i><span class="auth-version">v1.4</span><i aria-hidden="true"></i><a href="#" @click.prevent>이용 안내</a></footer>
  </div>
</template>

<style scoped>
.auth-page{display:flex;width:1440px;min-width:1440px;height:900px;margin:0 auto;flex-direction:column;background:var(--bg)}.auth-main{display:flex;flex:1;align-items:center;justify-content:center;padding-bottom:24px}.auth-card{display:flex;width:400px;flex-direction:column;gap:28px;transition:opacity .15s ease}.auth-card--loading{opacity:.55}.auth-header{display:flex;flex-direction:column;align-items:center;gap:20px;text-align:center}.auth-mark{display:grid;width:40px;height:40px;place-items:center;border-radius:10px;background:var(--ink);color:var(--bg);font-size:18px;font-weight:var(--fw-semibold)}.auth-heading h1{margin:0;font-size:24px;line-height:32px;font-weight:var(--fw-semibold);letter-spacing:-.01em}.auth-heading p{margin:6px 0 0;color:var(--text-2)}form{display:flex;flex-direction:column;gap:16px}.form-field{display:flex;flex-direction:column;gap:6px}.form-field__head{display:flex;align-items:baseline;justify-content:space-between}.form-field label{font-size:var(--fs-small);font-weight:var(--fw-medium)}.form-field__head a{color:var(--text-2);font-size:var(--fs-small)}form input{box-sizing:border-box;height:40px;padding:0 12px;border:1px solid var(--border);border-radius:var(--r-field);font:inherit;outline:none}form input:focus,form input[aria-invalid="true"]{border-color:var(--ink)}form .primary-button{width:100%;margin-top:4px}.field-error{display:flex;align-items:center;gap:6px;margin:0;color:var(--ink);font-size:var(--fs-meta);font-weight:var(--fw-medium)}.field-error span,.form-error>span{font-family:var(--font-mono);font-size:11px}.form-error{display:grid;grid-template-columns:auto 1fr;gap:10px;padding:12px 14px;border:1px solid var(--ink);border-radius:var(--r-field)}.form-error>span{padding-top:2px}.form-error strong{font-size:var(--fs-small);line-height:19px;font-weight:var(--fw-semibold)}.form-error p{margin:2px 0 0;color:var(--text-2);font-size:var(--fs-small);line-height:19px}.reviewer-account{display:flex;box-sizing:border-box;flex-direction:column;gap:10px;padding:16px;border-radius:var(--r-card);background:var(--surface)}.reviewer-account__head{display:flex;align-items:baseline;justify-content:space-between}.reviewer-account__head strong{font-size:var(--fs-small);font-weight:var(--fw-semibold)}.reviewer-account__head button{padding:0;border:0;background:none;color:var(--ink);font:inherit;font-size:var(--fs-small);font-weight:var(--fw-medium);cursor:pointer}.reviewer-account dl{display:grid;gap:6px;margin:0}.reviewer-account dl div{display:grid;grid-template-columns:64px 1fr;column-gap:12px;align-items:baseline}.reviewer-account dt{color:var(--text-4);font-size:var(--fs-meta)}.reviewer-account dd{margin:0;font-family:var(--font-mono);font-size:var(--fs-small)}.reviewer-account>p{margin:0;color:var(--text-4);font-size:var(--fs-meta)}.secondary-button{width:100%}.auth-page>footer{display:flex;height:48px;box-sizing:border-box;flex:none;align-items:center;justify-content:center;gap:16px;padding:0 120px;color:var(--text-4);font-size:var(--fs-meta)}.auth-page>footer i{width:1px;height:10px;background:var(--border)}.auth-page>footer a{color:var(--text-4)}.auth-version{font-family:var(--font-mono)}
@media (prefers-reduced-motion:reduce){.auth-card{transition:none}}
</style>
