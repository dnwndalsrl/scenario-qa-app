<script setup lang="ts">
import { UI_AUDIT_VIEWPORTS } from "~/shared/ui-audit";
import type { UiAuditViewportPreset } from "~/shared/types/ui-audit";

interface SubmitPayload { url: string; name: string; viewportPreset: UiAuditViewportPreset; design?: File }
const props = defineProps<{ loading?: boolean; url: string }>();
const emit = defineEmits<{ submit: [payload: SubmitPayload] }>();
const name = ref("UI 점검");
const viewportPreset = ref<UiAuditViewportPreset>("desktop");
const design = ref<File>();
const dimensions = ref<{ width: number; height: number }>();
const error = ref("");
const viewport = computed(() => UI_AUDIT_VIEWPORTS[viewportPreset.value]);
const resolutionMatches = computed(() => !dimensions.value || dimensions.value.width === viewport.value.width && dimensions.value.height === viewport.value.height);

function selectFile(file?: File) {
  error.value = "";
  dimensions.value = undefined;
  design.value = undefined;
  if (!file) return;
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 10 * 1024 * 1024) {
    error.value = "10MB 이하의 PNG 또는 JPG 이미지만 등록할 수 있습니다.";
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    design.value = file;
    dimensions.value = { width: image.naturalWidth, height: image.naturalHeight };
    URL.revokeObjectURL(objectUrl);
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    error.value = "정상적으로 열 수 있는 디자인 이미지를 선택해 주세요.";
  };
  image.src = objectUrl;
}

function onFileChange(event: Event) {
  selectFile((event.target as HTMLInputElement).files?.[0]);
}

function submit() {
  error.value = "";
  let target: URL;
  try { target = new URL(props.url.trim()); if (!["http:", "https:"].includes(target.protocol)) throw new Error(); }
  catch { error.value = "http:// 또는 https://로 시작하는 올바른 URL을 입력해 주세요."; return; }
  if (!name.value.trim()) { error.value = "검사 이름을 입력해 주세요."; return; }
  emit("submit", { url: target.toString(), name: name.value.trim(), viewportPreset: viewportPreset.value, design: design.value });
}
</script>

<template>
  <form class="qa-settings" novalidate @submit.prevent="submit">
    <header><strong>실행 전 설정</strong><span>모두 선택 사항 · 그대로 실행해도 됩니다</span></header>
    <div class="qa-settings__grid">
      <section class="qa-option-card">
        <div class="qa-option-card__title"><strong>검사 이름</strong><span>필수</span></div>
        <label class="sr-only" for="ui-audit-name">검사 이름</label>
        <input id="ui-audit-name" v-model="name" class="qa-compact-input" maxlength="80">
      </section>
      <section class="qa-option-card">
        <div class="qa-option-card__title"><strong>화면 크기</strong><span>기본 1440×900</span></div>
        <label class="sr-only" for="ui-audit-viewport">화면 크기</label>
        <select id="ui-audit-viewport" v-model="viewportPreset" class="qa-compact-input"><option v-for="item in UI_AUDIT_VIEWPORTS" :key="item.preset" :value="item.preset">{{ item.label }} · {{ item.width }}×{{ item.height }}</option></select>
      </section>
      <section class="qa-option-card qa-option-card--wide">
        <div class="qa-option-card__title"><strong>디자인 원본</strong><span>선택 · PNG/JPG 10MB 이하</span></div>
        <p>없으면 규칙 기반 점검(겹침·잘림·대비)만 진행합니다.</p>
        <div class="qa-file-picker"><label for="ui-design-image">이미지 선택</label><span>{{ design?.name || "선택한 파일 없음" }}</span><input id="ui-design-image" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" @change="onFileChange"></div>
        <p v-if="dimensions && !resolutionMatches" class="qa-file-warning">선택한 이미지 {{ dimensions.width }}×{{ dimensions.height }} · 권장 {{ viewport.width }}×{{ viewport.height }}</p>
      </section>
    </div>
    <footer class="qa-settings__submit"><div><strong>UI 점검 · {{ viewport.label }} {{ viewport.width }}×{{ viewport.height }} · {{ design ? '디자인 원본 있음' : '디자인 원본 없음' }}</strong><span>1 점검 대상 등록 → 2 화면·UI 규칙 수집 → 3 디자인 비교 보고서</span></div><button class="primary-button" type="submit" :disabled="loading">{{ loading ? "점검 준비 중" : "UI 점검 실행" }}</button></footer>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
  </form>
</template>
