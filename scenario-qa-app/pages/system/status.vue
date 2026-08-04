<script setup lang="ts">
interface Status { ok: boolean; checkedAt: string; latencyMs: number; services: Record<string, { configured: boolean; reachable?: boolean; role: string }>; limits: Record<string, number> }
const { $api } = useNuxtApp();
const { data, refresh } = await useFetch<Status>("/api/system/status", { $fetch: $api });
</script>
<template><div><div class="section-head"><div><p class="eyebrow">Runtime boundary</p><h1 style="font-size:42px">시스템 상태</h1><p>웹 앱과 실행기 경계, 연결 설정을 확인합니다.</p></div><button class="primary-button" @click="() => refresh()">다시 확인</button></div><div v-if="data" class="grid grid--3"><div v-for="(service, name) in data.services" :key="name" class="metric"><span>{{ name }}</span><strong>{{ service.configured && (service.reachable ?? true) ? '정상' : '설정 필요' }}</strong><p class="muted">{{ service.role }}</p></div></div><div v-if="data" class="notice">Supabase 응답 {{ data.latencyMs }}ms · 작업당 최대 {{ data.limits.workflowTimeoutMinutes }}분 · 사용자당 하루 {{ data.limits.dailyPerUser }}회</div></div></template>
