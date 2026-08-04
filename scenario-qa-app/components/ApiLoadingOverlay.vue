<script setup lang="ts">
const { isLoading } = useApiLoading();
</script>

<template>
  <Transition name="api-loading">
    <div v-if="isLoading" class="api-loading-overlay" role="status" aria-live="polite" aria-label="요청 처리 중">
      <div class="api-loading-card">
        <span class="api-loading-spinner" aria-hidden="true"></span>
        <strong>요청을 처리하고 있습니다</strong>
        <span>잠시만 기다려 주세요.</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.api-loading-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:24px;background:rgba(244,247,251,.82);backdrop-filter:blur(5px)}
.api-loading-card{display:grid;justify-items:center;gap:8px;min-width:260px;padding:28px;border:1px solid var(--line);border-radius:20px;background:white;box-shadow:0 24px 70px rgba(32,49,79,.18);color:var(--ink)}
.api-loading-card>span:last-child{color:var(--muted);font-size:13px}
.api-loading-spinner{width:38px;height:38px;margin-bottom:6px;border:4px solid #e0e7ff;border-top-color:var(--brand);border-radius:50%;animation:api-spin .75s linear infinite}
.api-loading-enter-active,.api-loading-leave-active{transition:opacity .15s ease}.api-loading-enter-from,.api-loading-leave-to{opacity:0}
@keyframes api-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.api-loading-spinner{animation-duration:1.5s}.api-loading-enter-active,.api-loading-leave-active{transition:none}}
</style>
