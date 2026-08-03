<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    pending?: boolean;
  }>(),
  {
    confirmLabel: "확인",
    danger: false,
    pending: false
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  confirm: [];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value)
});
</script>

<template>
  <el-dialog v-model="visible" :title="title" width="440px">
    <p class="confirm-dialog__message">{{ message }}</p>
    <template #footer>
      <el-button :disabled="pending" @click="visible = false">
        취소
      </el-button>
      <el-button
        :type="danger ? 'danger' : 'primary'"
        :loading="pending"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </el-button>
    </template>
  </el-dialog>
</template>
