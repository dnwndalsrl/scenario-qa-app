<script setup lang="ts">
interface SystemStatus {
  status: "ok" | "unavailable";
  version: string;
  commitSha: string;
  buildTimestamp: string;
  deploymentTimestamp: string;
  startedAt: string;
  uptimeSeconds: number;
  storage: { bytes: number; artifactBytes: number };
  scheduler: { enabled: boolean; running: boolean; ticking: boolean; lastTickAt?: string };
  activeRunCount: number;
  latestRun: { id: string; status: string; createdAt: string } | null;
  latestBackupAt: string | null;
  integrations: { emailConfigured: boolean; slackConfigured: boolean; openaiConfigured: boolean };
}

const { data, error, refresh } = await useFetch<SystemStatus>("/api/system/status");
const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const date = (value?: string | null) => value ? new Date(value).toLocaleString("ko-KR") : "기록 없음";
</script>

<template>
  <section class="status-page">
    <header>
      <div><p class="eyebrow">SYSTEM</p><h1>운영 상태</h1><p>민감한 설정값과 내부 파일 경로는 표시하지 않습니다.</p></div>
      <button type="button" @click="refresh()">새로고침</button>
    </header>
    <p v-if="error" class="status-error">상태 정보를 불러오지 못했습니다.</p>
    <template v-else-if="data">
      <div class="status-verdict" :class="`status-verdict--${data.status}`"><span>전체 상태</span><strong>{{ data.status }}</strong></div>
      <div class="status-grid">
        <article><span>버전</span><strong>{{ data.version }}</strong><small>{{ data.commitSha }}</small></article>
        <article><span>서버 시작</span><strong>{{ date(data.startedAt) }}</strong><small>가동 {{ Math.floor(data.uptimeSeconds / 60) }}분</small></article>
        <article><span>마지막 배포</span><strong>{{ date(data.deploymentTimestamp) }}</strong><small>빌드 {{ date(data.buildTimestamp) }}</small></article>
        <article><span>저장소</span><strong>{{ size(data.storage.bytes) }}</strong><small>artifact {{ size(data.storage.artifactBytes) }}</small></article>
        <article><span>스케줄러</span><strong>{{ data.scheduler.running ? "실행 중" : "중지" }}</strong><small>마지막 tick {{ date(data.scheduler.lastTickAt) }}</small></article>
        <article><span>진행 중 테스트</span><strong>{{ data.activeRunCount }}건</strong><small>최근 상태 {{ data.latestRun?.status ?? "없음" }}</small></article>
        <article><span>최근 백업</span><strong>{{ date(data.latestBackupAt) }}</strong></article>
        <article><span>연동</span><strong>AI {{ data.integrations.openaiConfigured ? "설정" : "미설정" }}</strong><small>이메일 {{ data.integrations.emailConfigured ? "설정" : "미설정" }} · Slack {{ data.integrations.slackConfigured ? "설정" : "미설정" }}</small></article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.status-page { display: grid; gap: 20px; }
.status-page header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.status-page h1 { margin: 4px 0 8px; font-size: 30px; }
.status-page p { margin: 0; color: #64748b; }
.eyebrow { color: #2563eb !important; font-size: 12px; font-weight: 800; letter-spacing: .14em; }
button { border: 0; border-radius: 9px; padding: 10px 14px; background: #0f172a; color: white; cursor: pointer; }
.status-verdict { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-radius: 14px; background: #ecfdf5; color: #065f46; }
.status-verdict--unavailable { background: #fef2f2; color: #991b1b; }
.status-verdict strong { text-transform: uppercase; }
.status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
article { display: grid; gap: 8px; min-height: 116px; padding: 18px; border: 1px solid #e2e8f0; border-radius: 14px; background: white; }
article span, article small { color: #64748b; }
article strong { font-size: 18px; overflow-wrap: anywhere; }
.status-error { padding: 16px; border-radius: 10px; background: #fef2f2; color: #991b1b !important; }
</style>
