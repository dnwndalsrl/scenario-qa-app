<script setup lang="ts">
import type { UiAuditViewportPreset } from "~/shared/types/ui-audit";

const router = useRouter();
const { $api } = useNuxtApp();
const loading = ref(false);
const error = ref("");
const analysisMode = ref<"functional" | "ui">("functional");
const targetUrl = ref("");
const urlInput = ref<HTMLInputElement>();

interface UsageSummary { dailyUsed: number; dailyLimit: number; active: number; concurrentLimit: number }
const { data } = await useFetch<{ usage: UsageSummary | null }>("/api/dashboard", { $fetch: $api, default: () => ({ usage: null }) });
const usage = computed(() => data.value.usage);

function editUrl() {
  nextTick(() => {
    urlInput.value?.focus();
    urlInput.value?.select();
  });
}

async function start(payload: { url: string; document?: File; authentication?: { loginUrl: string; username: string; password: string } }) {
  loading.value = true;
  error.value = "";
  try {
    const body = new FormData();
    body.append("request", JSON.stringify({ url: payload.url, authentication: payload.authentication }));
    if (payload.document) body.append("requirements", payload.document);
    const result = await $api<{ analysisId: string }>("/api/analyses", { method: "POST", body });
    await router.push(`/analyses/${result.analysisId}`);
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.data?.data?.message || cause?.message || "분석 요청에 실패했습니다.";
  } finally {
    loading.value = false;
  }
}

async function startUiAudit(payload: { url: string; name: string; viewportPreset: UiAuditViewportPreset; design?: File }) {
  loading.value = true;
  error.value = "";
  try {
    const body = new FormData();
    body.append("request", JSON.stringify({ url: payload.url, name: payload.name, viewportPreset: payload.viewportPreset }));
    if (payload.design) body.append("design", payload.design);
    const result = await $api<{ auditId: string }>("/api/ui-audits", { method: "POST", body });
    await router.push(`/ui-audits/${result.auditId}`);
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.data?.data?.message || cause?.message || "UI 점검 요청에 실패했습니다.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="qa-entry">
    <h1>어떤 페이지를 검증할까요?</h1>
    <div class="qa-workspace">
      <section class="qa-target-card" aria-label="분석 대상과 유형">
        <div class="qa-target-card__url">
          <label class="sr-only" for="qa-target-url">테스트할 페이지 URL</label>
          <input id="qa-target-url" ref="urlInput" v-model="targetUrl" type="url" inputmode="url" autocomplete="url" placeholder="https://example.com">
          <button v-if="targetUrl" type="button" @click="editUrl">URL 변경</button>
        </div>
        <div class="qa-target-card__meta">
          <div class="qa-mode-switch" role="tablist" aria-label="분석 유형">
            <button type="button" role="tab" :aria-selected="analysisMode === 'functional'" :class="{ active: analysisMode === 'functional' }" @click="analysisMode = 'functional'">기능 QA</button>
            <button type="button" role="tab" :aria-selected="analysisMode === 'ui'" :class="{ active: analysisMode === 'ui' }" @click="analysisMode = 'ui'">UI 점검</button>
          </div>
          <span v-if="usage">{{ usage.dailyUsed }}/{{ usage.dailyLimit }} 오늘 · {{ usage.active }}/{{ usage.concurrentLimit }} 실행 중</span>
        </div>
      </section>

      <UrlAnalysisForm v-if="analysisMode === 'functional'" :url="targetUrl" :loading="loading" @submit="start" />
      <UiAuditForm v-else :url="targetUrl" :loading="loading" @submit="startUiAudit" />
      <div v-if="error" class="error-box" role="alert">{{ error }}</div>
    </div>
  </section>
</template>
