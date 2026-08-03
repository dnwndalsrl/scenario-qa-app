<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
  actionLabel?: string;
}>();

const emit = defineEmits<{
  action: [];
}>();
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__icon" aria-hidden="true">□</div>
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
    <el-button
      v-if="actionLabel"
      type="primary"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </el-button>
  </div>
</template>
