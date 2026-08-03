<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    runId: string;
    artifactId: string | null;
    title?: string;
  }>(),
  {
    title: "실패 스크린샷"
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const loadFailed = ref(false);
const imageUrl = computed(() =>
  props.artifactId === null
    ? ""
    : `/api/test-runs/${encodeURIComponent(props.runId)}/artifacts/${encodeURIComponent(props.artifactId)}`
);

watch(imageUrl, () => {
  loadFailed.value = false;
});
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="min(1040px, 92vw)"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-alert
      v-if="loadFailed"
      title="스크린샷을 불러오지 못했습니다."
      type="error"
      :closable="false"
      show-icon
    />
    <div v-else class="screenshot-viewer">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="title"
        @error="loadFailed = true"
      >
    </div>
  </el-dialog>
</template>
