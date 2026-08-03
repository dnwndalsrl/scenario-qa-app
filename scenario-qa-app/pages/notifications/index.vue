<script setup lang="ts">
import { formatDateTime } from "../../utils/format";
const notifications = useNotifications();
onMounted(() => void notifications.execute());
async function read(item: AppNotification): Promise<void> { if (!item.readAt) await notifications.markRead(item.id); if (item.href) await navigateTo(item.href); else await notifications.refresh(); }
</script>
<template><div><AppPageHeader title="알림함" description="예약 실행 결과, 회귀 감지, 예약 오류를 한곳에서 확인합니다." /><el-alert v-if="notifications.error.value" :title="notifications.error.value" type="error" show-icon class="page-alert" /><div v-if="notifications.pending.value" class="form-panel"><el-skeleton :rows="6" animated /></div><AppEmptyState v-else-if="!notifications.data.value?.items.length" title="알림이 없습니다" description="예약 실행이 완료되면 설정한 조건에 따라 알림이 표시됩니다." /><div v-else class="notification-list"><article v-for="item in notifications.data.value.items" :key="item.id" class="notification-card" :class="{ 'notification-card--unread': !item.readAt }" @click="read(item)"><div><strong>{{ item.title }}</strong><span>{{ formatDateTime(item.createdAt) }}</span></div><p>{{ item.message }}</p><small>{{ item.type }} · {{ item.projectId }}</small></article></div></div></template>
