<script setup lang="ts">
import { useApiLoading } from "~/composables/useApiLoading";

const { isLoading } = useApiLoading();
</script>

<template>
  <Transition name="api-loading">
    <div v-if="isLoading" class="api-loading-overlay" role="status" aria-live="polite" aria-label="요청 처리 중">
      <div class="api-loading-card">
        <span class="api-loading-spinner" aria-hidden="true"></span>
        <div class="api-loading-copy"><strong>요청을 처리하고 있습니다</strong><span>잠시만 기다려 주세요.</span></div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.api-loading-overlay{position:fixed;inset:0;z-index:9999;display:grid;min-width:1440px;place-items:center;background:rgba(255,255,255,.6)}
.api-loading-card{display:grid;box-sizing:border-box;width:280px;justify-items:center;gap:14px;padding:28px 24px 24px;border:1px solid var(--border);border-radius:var(--r-composer);background:var(--bg);color:var(--ink);text-align:center}
.api-loading-card strong{font-size:var(--fs-body);font-weight:var(--fw-semibold)}
.api-loading-copy{display:grid;gap:4px}.api-loading-copy span{color:var(--text-2);font-size:var(--fs-small)}
.api-loading-spinner{width:28px;height:28px;border:2.5px solid var(--border);border-top-color:var(--ink);border-radius:50%;animation:api-spin .9s linear infinite}
.api-loading-enter-active,.api-loading-leave-active{transition:opacity .15s ease}.api-loading-enter-from,.api-loading-leave-to{opacity:0}
@keyframes api-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.api-loading-spinner{animation-duration:1.5s}.api-loading-enter-active,.api-loading-leave-active{transition:none}}
</style>
