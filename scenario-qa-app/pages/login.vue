<script setup lang="ts">
definePageMeta({ layout: false });
const route = useRoute();
const username = ref("");
const password = ref("");
const pending = ref(false);
const errorMessage = ref("");

async function submit(): Promise<void> {
  pending.value = true;
  errorMessage.value = "";
  try {
    await $fetch("/api/auth/login", { method: "POST", body: { username: username.value, password: password.value } });
    const requested = typeof route.query.redirect === "string" ? route.query.redirect : "/projects";
    await navigateTo(requested.startsWith("/") && !requested.startsWith("//") ? requested : "/projects");
  } catch {
    errorMessage.value = "아이디 또는 비밀번호를 확인해 주세요.";
  } finally {
    password.value = "";
    pending.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <form class="login-card" @submit.prevent="submit">
      <div class="login-brand"><span>SQ</span><div><strong>Scenario QA</strong><small>Northflank Sandbox</small></div></div>
      <div><p class="eyebrow">SECURE ACCESS</p><h1>관리자 로그인</h1><p>테스트 결과와 스크린샷은 인증된 사용자만 확인할 수 있습니다.</p></div>
      <label>아이디<input v-model="username" name="username" autocomplete="username" required maxlength="64"></label>
      <label>비밀번호<input v-model="password" name="password" type="password" autocomplete="current-password" required maxlength="256"></label>
      <p v-if="errorMessage" class="login-error" role="alert">{{ errorMessage }}</p>
      <button type="submit" :disabled="pending">{{ pending ? "확인 중…" : "로그인" }}</button>
    </form>
  </main>
</template>

<style scoped>
.login-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at top left, #dbeafe, transparent 42%), #f8fafc; }
.login-card { width: min(100%, 430px); display: grid; gap: 22px; padding: 32px; border: 1px solid #e2e8f0; border-radius: 18px; background: rgba(255,255,255,.96); box-shadow: 0 22px 60px rgba(15,23,42,.12); }
.login-brand { display: flex; align-items: center; gap: 12px; }
.login-brand > span { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: #2563eb; color: white; font-weight: 900; }
.login-brand div { display: grid; }.login-brand small { color: #64748b; }
.eyebrow { margin: 0 0 6px; color: #2563eb; font-size: 12px; font-weight: 800; letter-spacing: .14em; }
h1 { margin: 0 0 8px; font-size: 29px; } p { margin: 0; color: #64748b; line-height: 1.55; }
label { display: grid; gap: 8px; color: #334155; font-size: 14px; font-weight: 700; }
input { min-height: 46px; padding: 0 13px; border: 1px solid #cbd5e1; border-radius: 9px; font: inherit; } input:focus { outline: 3px solid #bfdbfe; border-color: #2563eb; }
button { min-height: 46px; border: 0; border-radius: 9px; background: #0f172a; color: white; font: inherit; font-weight: 800; cursor: pointer; } button:disabled { opacity: .6; cursor: wait; }
.login-error { color: #b91c1c; font-size: 14px; }
</style>
