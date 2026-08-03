<script setup lang="ts">
import { TEST_STATUS_PRESENTATION } from "../../constants/test-status";
import type { DisplayStatus } from "../../constants/test-status";

const props = defineProps<{
  status: DisplayStatus;
}>();

const presentation = computed(
  () => TEST_STATUS_PRESENTATION[props.status]
);
</script>

<template>
  <span
    class="status-badge"
    :class="`status-badge--${presentation.tone}`"
  >
    <span aria-hidden="true">{{ presentation.icon }}</span>
    {{ presentation.label }}
  </span>
</template>
