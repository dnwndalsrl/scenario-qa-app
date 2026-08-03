<script setup lang="ts">

const props = defineProps<{
  modelValue: TestStep[];
}>();

const emit = defineEmits<{
  "update:modelValue": [steps: TestStep[]];
}>();

function emitSteps(steps: TestStep[]): void {
  emit(
    "update:modelValue",
    steps.map((step, index) => ({ ...step, order: index + 1 }))
  );
}

function addStep(): void {
  emitSteps([
    ...props.modelValue,
    {
      id: createDraftId(),
      order: props.modelValue.length + 1,
      name: "",
      action: "goto",
      value: "",
      timeout: 15000,
      required: true
    }
  ]);
}

function updateStep(index: number, step: TestStep): void {
  const next = [...props.modelValue];
  next[index] = step;
  emitSteps(next);
}

function removeStep(index: number): void {
  emitSteps(props.modelValue.filter((_step, itemIndex) => itemIndex !== index));
}

function copyStep(index: number): void {
  const source = props.modelValue[index];
  if (source === undefined) {
    return;
  }
  const copy: TestStep = {
    ...source,
    id: createDraftId(),
    name: `${source.name} 복사본`,
    ...(source.target === undefined
      ? {}
      : { target: { ...source.target } }),
    ...(source.expected === undefined
      ? {}
      : { expected: { ...source.expected } })
  };
  const next = [...props.modelValue];
  next.splice(index + 1, 0, copy);
  emitSteps(next);
}

function moveStep(index: number, direction: -1 | 1): void {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= props.modelValue.length) {
    return;
  }
  const next = [...props.modelValue];
  const current = next[index];
  const target = next[targetIndex];
  if (current === undefined || target === undefined) {
    return;
  }
  next[index] = target;
  next[targetIndex] = current;
  emitSteps(next);
}

function createDraftId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `step-${Date.now()}`;
}
</script>

<template>
  <section class="step-editor">
    <div class="section-heading">
      <div>
        <h2>테스트 단계</h2>
        <p>실행 순서대로 단계를 구성하세요. 순서는 저장 시 자동 정렬됩니다.</p>
      </div>
      <el-button type="primary" plain @click="addStep">+ 단계 추가</el-button>
    </div>

    <AppEmptyState
      v-if="modelValue.length === 0"
      title="등록된 단계가 없습니다"
      description="테스트를 실행하려면 최소 한 개의 단계를 추가하세요."
      action-label="첫 단계 추가"
      @action="addStep"
    />
    <div v-else class="step-editor__list">
      <ScenarioStepItem
        v-for="(step, index) in modelValue"
        :key="step.id"
        :step="step"
        :index="index"
        :total="modelValue.length"
        @update:step="updateStep(index, $event)"
        @remove="removeStep(index)"
        @copy="copyStep(index)"
        @move-up="moveStep(index, -1)"
        @move-down="moveStep(index, 1)"
      />
    </div>
  </section>
</template>
