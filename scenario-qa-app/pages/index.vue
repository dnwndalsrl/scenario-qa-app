<script setup lang="ts">
import type { UiAuditViewportPreset } from "~/shared/types/ui-audit";
const router = useRouter(); const { $api } = useNuxtApp(); const loading = ref(false); const error = ref(""); const analysisMode = ref<"functional" | "ui">("functional");
interface UsageSummary { dailyUsed: number; dailyLimit: number; active: number; concurrentLimit: number }
const { data } = await useFetch<{ usage: UsageSummary | null }>("/api/dashboard", { $fetch: $api, default: () => ({ usage: null }) });
const usage = computed(() => data.value.usage);
async function start(payload: { url: string; document?: File; authentication?: { loginUrl: string; username: string; password: string } }) { loading.value=true; error.value=""; try { const body=new FormData(); body.append("request",JSON.stringify({url:payload.url,authentication:payload.authentication})); if(payload.document) body.append("requirements",payload.document); const result=await $api<{analysisId:string}>("/api/analyses",{method:"POST",body}); await router.push(`/analyses/${result.analysisId}`); } catch(cause:any){ error.value=cause?.data?.statusMessage||cause?.data?.data?.message||cause?.message||"분석 요청에 실패했습니다."; } finally{loading.value=false;} }
async function startUiAudit(payload: { url: string; name: string; viewportPreset: UiAuditViewportPreset; design?: File }) { loading.value=true; error.value=""; try { const body=new FormData(); body.append("request",JSON.stringify({url:payload.url,name:payload.name,viewportPreset:payload.viewportPreset})); if(payload.design) body.append("design",payload.design); const result=await $api<{auditId:string}>("/api/ui-audits",{method:"POST",body}); await router.push(`/ui-audits/${result.auditId}`); } catch(cause:any){ error.value=cause?.data?.statusMessage||cause?.data?.data?.message||cause?.message||"UI 점검 요청에 실패했습니다."; } finally{loading.value=false;} }
</script>

<template>
  <section class="hero">
    <div class="hero-copy"><h1>URL 하나로 시작하는 QA</h1><p class="lead">페이지를 분석하고 검토 가능한 테스트와 UI 점검 결과를 만듭니다.</p></div>
    <div class="analysis-mode">
      <div class="analysis-mode__switch" role="tablist" aria-label="분석 유형"><button type="button" role="tab" :aria-selected="analysisMode === 'functional'" :class="{ active: analysisMode === 'functional' }" @click="analysisMode = 'functional'">기능 QA</button><button type="button" role="tab" :aria-selected="analysisMode === 'ui'" :class="{ active: analysisMode === 'ui' }" @click="analysisMode = 'ui'">UI 점검</button></div>
      <UrlAnalysisForm v-if="analysisMode === 'functional'" :loading="loading" @submit="start" />
      <UiAuditForm v-else :loading="loading" @submit="startUiAudit" />
      <div v-if="error" class="error-box" role="alert">{{ error }}</div>
      <p v-if="usage && analysisMode === 'functional'" class="usage-line">오늘 {{ usage.dailyUsed }}/{{ usage.dailyLimit }}회 사용 · 현재 {{ usage.active }}/{{ usage.concurrentLimit }}개 실행 중</p>
    </div>
  </section>
</template>

<style scoped>
.usage-line{margin:0;text-align:center;color:var(--text-4);font-size:var(--fs-meta)}
</style>
