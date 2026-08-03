<script setup lang="ts">
import { TEST_ACTION_LABELS } from "../../constants/test-action";
import { formatDuration, formatJsonValue } from "../../utils/format";

const props = defineProps<{
  step: RunStepResult;
  index: number;
}>();

const emit = defineEmits<{
  "view-screenshot": [artifactId: string, title: string];
}>();

const detailsOpen = ref(
  props.step.status === "failed" || props.step.status === "error"
);

function formatDisplayValue(value: JsonValue): string {
  return formatJsonValue(value).replaceAll("[REDACTED]", "••••••••");
}
</script>

<template>
  <article
    class="run-step"
    :class="`run-step--${step.status}`"
  >
    <button
      class="run-step__header"
      type="button"
      :aria-expanded="detailsOpen"
      @click="detailsOpen = !detailsOpen"
    >
      <span class="run-step__number">{{ index + 1 }}</span>
      <span class="run-step__identity">
        <strong>{{ step.stepName }}</strong>
        <small>{{ TEST_ACTION_LABELS[step.action] }}</small>
      </span>
      <AppStatusBadge :status="step.status" />
      <span class="run-step__time">{{ formatDuration(step.durationMs) }}</span>
      <span class="run-step__chevron" aria-hidden="true">
        {{ detailsOpen ? "⌃" : "⌄" }}
      </span>
    </button>

    <div v-if="detailsOpen" class="run-step__body">
      <div class="run-step__values">
        <div>
          <span>예상 값</span>
          <pre>{{ formatDisplayValue(step.expected) }}</pre>
        </div>
        <div>
          <span>실제 값</span>
          <pre>{{ formatDisplayValue(step.actual) }}</pre>
        </div>
      </div>
      <div class="run-step__url">
        <span>실행 URL</span>
        <code>{{ step.currentUrl || "-" }}</code>
      </div>
      <el-alert
        v-if="step.errorMessage"
        :title="step.errorMessage"
        type="error"
        :closable="false"
        show-icon
      />
      <el-button
        v-if="step.screenshotArtifactId"
        type="primary"
        plain
        @click.stop="
          emit(
            'view-screenshot',
            step.screenshotArtifactId,
            `${index + 1}단계 · ${step.stepName}`
          )
        "
      >
        실패 스크린샷 보기
      </el-button>
    </div>
  </article>
</template>
