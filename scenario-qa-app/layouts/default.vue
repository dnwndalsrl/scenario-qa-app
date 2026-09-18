<script setup lang="ts">
import { useAuthSession } from "~/composables/useAuthSession";

const session = useAuthSession();
const { $api } = useNuxtApp();
async function logout() {
  await $api("/api/auth/logout", { method: "POST" });
  session.value = { authenticated: false, user: null };
  await navigateTo("/login");
}
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
    <header class="topbar">
      <NuxtLink class="brand" to="/" aria-label="Probe QA 홈"><span class="brand__mark">P</span><strong>Probe QA</strong></NuxtLink>
      <nav class="topbar__nav" aria-label="주 메뉴"><NuxtLink to="/">새 분석</NuxtLink><NuxtLink to="/analyses">분석 이력</NuxtLink><NuxtLink to="/defects">결함 관리</NuxtLink><NuxtLink to="/system/status">시스템 상태</NuxtLink></nav>
      <button class="text-button topbar__account" type="button" @click="logout"><span v-if="session?.user?.email">{{ session.user.email }} · </span>로그아웃</button>
    </header>
    <main id="main-content" tabindex="-1"><slot /></main>
    <footer><span>Probe QA</span><i aria-hidden="true">|</i><span>v1.4</span><i aria-hidden="true">|</i><span>이용 안내</span></footer>
  </div>
</template>
