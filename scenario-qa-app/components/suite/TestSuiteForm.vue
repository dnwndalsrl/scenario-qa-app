<script setup lang="ts">
import { ElMessage } from "element-plus";

const props = defineProps<{
  scenarios: ScenarioSummary[];
  initialValue?: TestSuite;
  pending?: boolean;
}>();

const emit = defineEmits<{
  submit: [value: TestSuiteInput];
  cancel: [];
}>();

interface EditableItem {
  scenarioId: string;
  enabled: boolean;
  required: boolean;
}

const form = reactive({
  name: props.initialValue?.name ?? "",
  description: props.initialValue?.description ?? "",
  status: props.initialValue?.status ?? ("active" as TestSuiteStatus),
  executionPolicy:
    props.initialValue?.executionPolicy ??
    ("stop_on_failure" as SuiteExecutionPolicy),
  defaultTimeout: props.initialValue?.defaultTimeout ?? 180000
});
const selectedScenarioId = ref("");
const items = ref<EditableItem[]>(
  [...(props.initialValue?.items ?? [])]
    .sort((left, right) => left.order - right.order)
    .map((item) => ({
      scenarioId: item.scenarioId,
      enabled: item.enabled,
      required: item.required
    }))
);

const availableScenarios = computed(() => {
  const selected = new Set(items.value.map((item) => item.scenarioId));
  return props.scenarios.filter((scenario) => !selected.has(scenario.id));
});

function scenarioName(scenarioId: string): string {
  return props.scenarios.find((scenario) => scenario.id === scenarioId)?.name ??
    `삭제된 시나리오 (${scenarioId})`;
}

function addScenario(): void {
  if (!selectedScenarioId.value) {
    ElMessage.info("추가할 시나리오를 선택해 주세요.");
    return;
  }
  if (items.value.some((item) => item.scenarioId === selectedScenarioId.value)) {
    ElMessage.warning("이미 추가된 시나리오입니다.");
    return;
  }
  items.value.push({
    scenarioId: selectedScenarioId.value,
    enabled: true,
    required: true
  });
  selectedScenarioId.value = "";
}

function move(index: number, offset: -1 | 1): void {
  const target = index + offset;
  if (target < 0 || target >= items.value.length) return;
  const current = items.value[index];
  const other = items.value[target];
  if (current === undefined || other === undefined) return;
  items.value.splice(index, 1, other);
  items.value.splice(target, 1, current);
}

function submit(): void {
  if (!form.name.trim()) {
    ElMessage.error("스위트 이름을 입력해 주세요.");
    return;
  }
  if (items.value.length === 0) {
    ElMessage.error("시나리오를 한 개 이상 추가해 주세요.");
    return;
  }
  emit("submit", {
    name: form.name.trim(),
    ...(form.description.trim() ? { description: form.description.trim() } : {}),
    status: form.status,
    executionPolicy: form.executionPolicy,
    defaultTimeout: form.defaultTimeout,
    items: items.value.map((item, index) => ({
      ...item,
      order: index + 1
    }))
  });
}
</script>

<template>
  <section class="form-panel suite-form">
    <el-form label-position="top">
      <div class="form-grid form-grid--two">
        <el-form-item label="스위트 이름" required>
          <el-input v-model="form.name" maxlength="120" show-word-limit />
        </el-form-item>
        <el-form-item label="상태">
          <el-radio-group v-model="form.status">
            <el-radio-button value="active">활성</el-radio-button>
            <el-radio-button value="inactive">비활성</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </div>
      <el-form-item label="설명">
        <el-input v-model="form.description" type="textarea" :rows="3" />
      </el-form-item>
      <div class="form-grid form-grid--two">
        <el-form-item label="실행 정책">
          <el-select v-model="form.executionPolicy">
            <el-option label="실패해도 계속 실행" value="continue_on_failure" />
            <el-option label="실패 또는 오류 시 중단" value="stop_on_failure" />
            <el-option label="오류 시에만 중단" value="stop_on_error" />
          </el-select>
        </el-form-item>
        <el-form-item label="스위트 Timeout (ms)">
          <el-input-number
            v-model="form.defaultTimeout"
            :min="1000"
            :max="1800000"
            :step="1000"
          />
        </el-form-item>
      </div>
    </el-form>

    <div class="suite-form__selector">
      <el-select
        v-model="selectedScenarioId"
        placeholder="시나리오 선택"
        filterable
      >
        <el-option
          v-for="scenario in availableScenarios"
          :key="scenario.id"
          :label="scenario.name"
          :value="scenario.id"
        />
      </el-select>
      <el-button @click="addScenario">시나리오 추가</el-button>
    </div>

    <div class="suite-sort-list">
      <article
        v-for="(item, index) in items"
        :key="item.scenarioId"
        class="suite-sort-item"
        :class="{ 'suite-sort-item--invalid': !scenarios.some((scenario) => scenario.id === item.scenarioId) }"
      >
        <span class="step-number">{{ index + 1 }}</span>
        <div class="suite-sort-item__name">
          <strong>{{ scenarioName(item.scenarioId) }}</strong>
          <small>{{ item.scenarioId }}</small>
        </div>
        <el-switch v-model="item.enabled" active-text="실행" inactive-text="제외" />
        <el-checkbox v-model="item.required">필수</el-checkbox>
        <div class="suite-sort-item__actions">
          <el-button text :disabled="index === 0" @click="move(index, -1)">↑</el-button>
          <el-button text :disabled="index === items.length - 1" @click="move(index, 1)">↓</el-button>
          <el-button text type="danger" @click="items.splice(index, 1)">제거</el-button>
        </div>
      </article>
    </div>
    <el-alert
      v-if="items.some((item) => !scenarios.some((scenario) => scenario.id === item.scenarioId))"
      title="삭제된 시나리오가 포함되어 있습니다. 해당 항목을 제거해야 저장할 수 있습니다."
      type="warning"
      show-icon
      :closable="false"
      class="page-alert"
    />
    <div class="form-actions">
      <el-button :disabled="pending" @click="emit('cancel')">취소</el-button>
      <el-button type="primary" :loading="pending" @click="submit">저장</el-button>
    </div>
  </section>
</template>
