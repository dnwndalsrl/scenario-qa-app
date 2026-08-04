<script setup lang="ts">
import { useAuthSession } from "~/composables/useAuthSession";

const session = useAuthSession();
async function logout(){ await $fetch("/api/auth/logout", { method: "POST" }); session.value = { authenticated: false, user: null }; await navigateTo("/login"); }
</script>
<template><div class="app-shell"><header class="topbar"><NuxtLink class="brand" to="/" aria-label="Probe QA 홈"><span class="brand__mark">P</span><span><strong>Probe QA</strong><small>URL 기반 AI 웹 QA</small></span></NuxtLink><nav aria-label="주 메뉴"><NuxtLink to="/">새 분석</NuxtLink><NuxtLink to="/analyses">분석 이력</NuxtLink><NuxtLink to="/system/status">시스템 상태</NuxtLink></nav><span class="mode-pill">Actions 실행기</span><button class="text-button" @click="logout">로그아웃<span v-if="session?.user?.email"> · {{ session.user.email }}</span></button></header><main><slot /></main><footer>Vercel은 요청만 처리하고, Chromium·AI·테스트는 GitHub Actions에서 실행됩니다.</footer></div></template>
<style scoped>.text-button{border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style>
