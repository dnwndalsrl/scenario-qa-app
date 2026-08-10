<script setup lang="ts">
import type { SiteAnalysis } from "~/shared/types/analysis";
import { uiLabel } from "~/utils/ui-label";
const { $api } = useNuxtApp();
const { data, refresh, error } = await useFetch<{ items: SiteAnalysis[] }>("/api/analyses", { $fetch: $api, default: () => ({ items: [] }) });
</script>
<template>
  <div>
    <div class="section-head"><div><p class="eyebrow">Analysis history</p><h1 style="font-size:42px">분석 이력</h1><p>내 계정으로 요청한 최근 50개 작업입니다.</p></div><button class="primary-button" @click="() => refresh()">새로고침</button></div>
    <div v-if="error" class="error-box" role="alert">분석 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>
    <div v-else-if="!data.items.length" class="empty">분석 기록이 없습니다.</div>
    <div v-else class="card"><NuxtLink v-for="item in data.items" :key="item.id" class="analysis-row" :to="`/analyses/${item.id}`"><div><div class="analysis-row__url">{{ item.normalizedUrl }}</div><div class="analysis-row__meta"><span>{{ new Date(item.createdAt).toLocaleString('ko-KR') }}</span><span>{{ item.progress }}%</span><span>{{ item.currentMessage }}</span></div></div><span class="tag" :class="`tag--${item.status === 'completed' ? 'success' : item.status === 'failed' ? 'failed' : 'warning'}`">{{ uiLabel(item.status) }}</span></NuxtLink></div>
  </div>
</template>
