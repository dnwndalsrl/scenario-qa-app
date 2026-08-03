<script setup lang="ts">
import { APP_ROUTES } from "../constants/route";

const route = useRoute();
const ui = useUiStore();
const notifications = useNotifications();
const runtimeConfig = useRuntimeConfig();
onMounted(() => void notifications.execute());

async function logout(): Promise<void> {
  await $fetch("/api/auth/logout", { method: "POST" });
  await navigateTo("/login");
}

const navigation = [
  { label: "프로젝트", path: APP_ROUTES.projects, icon: "▦" },
  { label: "테스트 실행 이력", path: APP_ROUTES.runs, icon: "↻" }
];

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(`${path}/`);
}
</script>

<template>
  <div class="app-shell">
    <button
      v-if="ui.sidebarOpen"
      class="sidebar-backdrop"
      aria-label="사이드바 닫기"
      @click="ui.closeSidebar"
    />
    <aside class="sidebar" :class="{ 'sidebar--open': ui.sidebarOpen }">
      <NuxtLink class="brand" to="/projects" @click="ui.closeSidebar">
        <span class="brand__mark">SQ</span>
        <span>
          <strong>Scenario QA</strong>
          <small>Playwright 관리 도구</small>
        </span>
      </NuxtLink>
      <nav class="sidebar__nav" aria-label="주 메뉴">
        <NuxtLink
          v-for="item in navigation"
          :key="item.path"
          :to="item.path"
          class="sidebar__link"
          :class="{ 'sidebar__link--active': isActive(item.path) }"
          @click="ui.closeSidebar"
        >
          <span aria-hidden="true">{{ item.icon }}</span>
          {{ item.label }}
        </NuxtLink>
      </nav>
      <div class="sidebar__footer">
        <span class="environment-dot" />
        로컬 MVP
      </div>
    </aside>

    <div class="app-main">
      <div v-if="runtimeConfig.public.demoMode" class="sandbox-notice" role="status">
        현재 서비스는 무료 Sandbox에서 운영되는 검증용 버전입니다.
        <span v-if="!runtimeConfig.public.persistentStorage">재배포 또는 플랫폼 정책에 따라 실행 결과와 스크린샷이 초기화될 수 있습니다.</span>
      </div>
      <header class="topbar">
        <button
          class="topbar__menu"
          aria-label="사이드바 열기"
          @click="ui.toggleSidebar"
        >
          ☰
        </button>
        <div>
          <strong>테스트 관리</strong>
          <span>실제 Playwright 결과만 표시합니다</span>
        </div>
        <span class="topbar__mode">Chromium · 단일 실행</span>
        <NuxtLink class="topbar__notification" to="/notifications">
          알림
          <span v-if="notifications.data.value?.unreadCount" class="notification-count">{{ notifications.data.value.unreadCount }}</span>
        </NuxtLink>
        <button v-if="runtimeConfig.public.appAuthEnabled" type="button" class="topbar__logout" @click="logout">로그아웃</button>
      </header>
      <main class="content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.sandbox-notice { padding: 9px 18px; background: #fff7ed; border-bottom: 1px solid #fed7aa; color: #9a3412; font-size: 13px; line-height: 1.5; }
.sandbox-notice span { margin-left: 6px; }
.topbar__logout { border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 10px; background: white; color: #334155; cursor: pointer; }
</style>
