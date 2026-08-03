<script setup lang="ts">
import { ElMessage } from "element-plus";

const props = defineProps<{
  suites: TestSuiteSummary[];
  initialValue?: TestSchedule;
  pending?: boolean;
  preview?: SchedulePreviewResult | null;
  previewPending?: boolean;
}>();

const emit = defineEmits<{
  submit: [value: TestScheduleInput];
  cancel: [];
  preview: [value: Pick<TestScheduleInput, "scheduleType" | "scheduleConfig" | "timezone">];
}>();

const initialConfig = props.initialValue?.scheduleConfig;
const form = reactive({
  suiteId: props.initialValue?.suiteId ?? "",
  name: props.initialValue?.name ?? "",
  description: props.initialValue?.description ?? "",
  status: props.initialValue?.status ?? ("active" as const),
  scheduleType: props.initialValue?.scheduleType ?? ("daily" as ScheduleType),
  timezone: props.initialValue?.timezone ?? "Asia/Seoul",
  runAt: initialConfig?.type === "once" ? initialConfig.runAt.slice(0, 16) : "",
  hour: "hour" in (initialConfig ?? {}) ? (initialConfig as DailyScheduleConfig).hour : 9,
  minute: "minute" in (initialConfig ?? {}) ? (initialConfig as DailyScheduleConfig).minute : 0,
  daysOfWeek: initialConfig?.type === "weekly" ? [...initialConfig.daysOfWeek] : [1],
  dayOfMonth: initialConfig?.type === "monthly" ? initialConfig.dayOfMonth : 1,
  invalidDayPolicy: initialConfig?.type === "monthly" ? initialConfig.invalidDayPolicy : ("skip" as const),
  cronExpression: initialConfig?.type === "cron" ? initialConfig.expression : "0 9 * * 1-5",
  concurrencyPolicy: props.initialValue?.concurrencyPolicy ?? ("skip" as ScheduleConcurrencyPolicy),
  missedRunPolicy: props.initialValue?.missedRunPolicy ?? ("run_once" as MissedRunPolicy),
  notifyOnSuccess: props.initialValue?.notificationPolicy.notifyOnSuccess ?? true,
  notifyOnFailure: props.initialValue?.notificationPolicy.notifyOnFailure ?? true,
  notifyOnPartialSuccess: props.initialValue?.notificationPolicy.notifyOnPartialSuccess ?? true,
  notifyOnRegression: props.initialValue?.notificationPolicy.notifyOnRegression ?? true,
  notifyOnScheduleError: props.initialValue?.notificationPolicy.notifyOnScheduleError ?? true,
  channels: props.initialValue?.notificationPolicy.channels ?? (["in_app"] as NotificationChannel[]),
  emailText: "",
  slackWebhookUrl: ""
});

const timezoneOptions = ["Asia/Seoul", "UTC", "America/New_York", "Europe/London", "Asia/Tokyo"];
const dayOptions = [
  { label: "일", value: 0 }, { label: "월", value: 1 }, { label: "화", value: 2 },
  { label: "수", value: 3 }, { label: "목", value: 4 }, { label: "금", value: 5 }, { label: "토", value: 6 }
];

function scheduleConfig(): TestScheduleConfig {
  switch (form.scheduleType) {
    case "once": return { type: "once", runAt: form.runAt };
    case "daily": return { type: "daily", hour: form.hour, minute: form.minute };
    case "weekly": return { type: "weekly", daysOfWeek: [...form.daysOfWeek], hour: form.hour, minute: form.minute };
    case "monthly": return { type: "monthly", dayOfMonth: form.dayOfMonth, hour: form.hour, minute: form.minute, invalidDayPolicy: form.invalidDayPolicy };
    case "cron": return { type: "cron", expression: form.cronExpression.trim() };
  }
}

function previewSchedule(): void {
  emit("preview", { scheduleType: form.scheduleType, scheduleConfig: scheduleConfig(), timezone: form.timezone });
}

function submit(): void {
  if (!form.suiteId || !form.name.trim()) {
    ElMessage.error("테스트 스위트와 예약 이름을 입력해 주세요.");
    return;
  }
  if (form.channels.length === 0) {
    ElMessage.error("알림 채널을 한 개 이상 선택해 주세요.");
    return;
  }
  const emailTargets = form.emailText.split(/[\n,;]/).map((email) => email.trim()).filter(Boolean).map((email) => ({ email, enabled: true }));
  emit("submit", {
    suiteId: form.suiteId, name: form.name.trim(),
    ...(form.description.trim() ? { description: form.description.trim() } : {}),
    status: form.status, scheduleType: form.scheduleType, timezone: form.timezone,
    scheduleConfig: scheduleConfig(), concurrencyPolicy: form.concurrencyPolicy,
    missedRunPolicy: form.missedRunPolicy,
    notificationPolicy: {
      notifyOnSuccess: form.notifyOnSuccess, notifyOnFailure: form.notifyOnFailure,
      notifyOnPartialSuccess: form.notifyOnPartialSuccess, notifyOnRegression: form.notifyOnRegression,
      notifyOnScheduleError: form.notifyOnScheduleError, channels: [...form.channels]
    },
    emailTargets,
    ...(form.slackWebhookUrl.trim() ? { slackWebhookUrl: form.slackWebhookUrl.trim() } : {})
  });
}
</script>

<template>
  <section class="form-panel schedule-form">
    <el-form label-position="top">
      <div class="form-grid form-grid--two">
        <el-form-item label="테스트 스위트" required>
          <el-select v-model="form.suiteId" filterable placeholder="실행할 스위트 선택">
            <el-option v-for="suite in suites.filter((item) => item.status === 'active')" :key="suite.id" :label="suite.name" :value="suite.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="상태">
          <el-radio-group v-model="form.status"><el-radio-button value="active">활성</el-radio-button><el-radio-button value="inactive">비활성</el-radio-button></el-radio-group>
        </el-form-item>
      </div>
      <el-form-item label="예약 이름" required><el-input v-model="form.name" maxlength="100" show-word-limit /></el-form-item>
      <el-form-item label="설명"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>

      <h3 class="schedule-form__title">실행 주기</h3>
      <div class="form-grid form-grid--two">
        <el-form-item label="주기 유형">
          <el-select v-model="form.scheduleType">
            <el-option label="한 번" value="once" /><el-option label="매일" value="daily" /><el-option label="매주" value="weekly" /><el-option label="매월" value="monthly" /><el-option label="Cron 고급 설정" value="cron" />
          </el-select>
        </el-form-item>
        <el-form-item label="시간대 (IANA)">
          <el-select v-model="form.timezone" filterable allow-create default-first-option>
            <el-option v-for="timezone in timezoneOptions" :key="timezone" :label="timezone" :value="timezone" />
          </el-select>
        </el-form-item>
      </div>
      <el-form-item v-if="form.scheduleType === 'once'" label="실행 일시"><el-input v-model="form.runAt" type="datetime-local" /></el-form-item>
      <template v-else-if="form.scheduleType !== 'cron'">
        <el-form-item v-if="form.scheduleType === 'weekly'" label="요일"><el-checkbox-group v-model="form.daysOfWeek"><el-checkbox-button v-for="day in dayOptions" :key="day.value" :value="day.value">{{ day.label }}</el-checkbox-button></el-checkbox-group></el-form-item>
        <div class="form-grid form-grid--two">
          <el-form-item v-if="form.scheduleType === 'monthly'" label="날짜"><el-input-number v-model="form.dayOfMonth" :min="1" :max="31" /></el-form-item>
          <el-form-item label="시각"><div class="schedule-time"><el-input-number v-model="form.hour" :min="0" :max="23" /><span>:</span><el-input-number v-model="form.minute" :min="0" :max="59" /></div></el-form-item>
        </div>
        <el-form-item v-if="form.scheduleType === 'monthly'" label="존재하지 않는 날짜"><el-radio-group v-model="form.invalidDayPolicy"><el-radio value="skip">건너뛰기</el-radio><el-radio value="last_day">해당 월 마지막 날</el-radio></el-radio-group></el-form-item>
      </template>
      <el-form-item v-else label="Cron 표현식 (분 시 일 월 요일)"><el-input v-model="form.cronExpression" placeholder="0 9 * * 1-5" /></el-form-item>
      <div class="schedule-preview-action"><el-button :loading="previewPending" @click="previewSchedule">다음 5회 미리보기</el-button></div>
      <el-alert v-if="preview" :title="preview.summary" type="info" :closable="false" class="page-alert">
        <template #default><ol class="schedule-preview-list"><li v-for="item in preview.occurrences" :key="item.runAt">{{ item.localDisplayTime }} <small>({{ item.runAt }})</small></li></ol></template>
      </el-alert>

      <h3 class="schedule-form__title">충돌·누락 정책</h3>
      <div class="form-grid form-grid--two">
        <el-form-item label="동시 실행"><el-select v-model="form.concurrencyPolicy"><el-option label="진행 중이면 건너뛰기" value="skip" /><el-option label="한 번만 대기" value="queue_once" /></el-select></el-form-item>
        <el-form-item label="서버 중단 중 놓친 실행"><el-select v-model="form.missedRunPolicy"><el-option label="건너뛰기" value="skip" /><el-option label="가장 최근 한 번 실행" value="run_once" /></el-select></el-form-item>
      </div>

      <h3 class="schedule-form__title">알림</h3>
      <el-form-item label="조건"><el-checkbox v-model="form.notifyOnSuccess">성공</el-checkbox><el-checkbox v-model="form.notifyOnFailure">실패</el-checkbox><el-checkbox v-model="form.notifyOnPartialSuccess">부분 성공</el-checkbox><el-checkbox v-model="form.notifyOnRegression">회귀 감지</el-checkbox><el-checkbox v-model="form.notifyOnScheduleError">예약 오류·건너뜀</el-checkbox></el-form-item>
      <el-form-item label="채널"><el-checkbox-group v-model="form.channels"><el-checkbox value="in_app">앱</el-checkbox><el-checkbox value="email">이메일</el-checkbox><el-checkbox value="slack">Slack</el-checkbox></el-checkbox-group></el-form-item>
      <el-form-item v-if="form.channels.includes('email')" label="이메일 수신자"><el-input v-model="form.emailText" type="textarea" :rows="2" placeholder="qa@example.com, owner@example.com" /><small v-if="initialValue?.emailTargets.length">저장된 수신자 {{ initialValue.emailTargets.map((item) => item.emailMasked).join(', ') }} · 비워 두면 기존 값을 유지합니다.</small></el-form-item>
      <el-form-item v-if="form.channels.includes('slack')" label="Slack Incoming Webhook"><el-input v-model="form.slackWebhookUrl" type="password" show-password autocomplete="off" placeholder="https://hooks.slack.com/services/..." /><small v-if="initialValue?.slackConfigured">Webhook이 안전하게 저장되어 있습니다. 변경할 때만 새 URL을 입력하세요.</small></el-form-item>
    </el-form>
    <div class="form-actions"><el-button :disabled="pending" @click="emit('cancel')">취소</el-button><el-button type="primary" :loading="pending" @click="submit">예약 저장</el-button></div>
  </section>
</template>
