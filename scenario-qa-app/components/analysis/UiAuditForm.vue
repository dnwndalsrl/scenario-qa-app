<script setup lang="ts">
import { UI_AUDIT_VIEWPORTS } from "~/shared/ui-audit";
import type { UiAuditViewportPreset } from "~/shared/types/ui-audit";

interface SubmitPayload { url: string; name: string; viewportPreset: UiAuditViewportPreset; design?: File }
const emit = defineEmits<{ submit: [payload: SubmitPayload] }>(); defineProps<{ loading?: boolean }>();
const url = ref(""); const name = ref("UI 점검"); const viewportPreset = ref<UiAuditViewportPreset>("desktop");
const design = ref<File>(); const previewUrl = ref(""); const dimensions = ref<{ width: number; height: number }>(); const error = ref("");
const settingsOpen = ref(false);
const viewport = computed(() => UI_AUDIT_VIEWPORTS[viewportPreset.value]);
const resolutionMatches = computed(() => !dimensions.value || dimensions.value.width === viewport.value.width && dimensions.value.height === viewport.value.height);
function openSettings() { error.value = ""; try { const target = new URL(url.value.trim()); if (!["http:", "https:"].includes(target.protocol)) throw new Error(); settingsOpen.value = true; } catch { error.value = "http:// 또는 https://로 시작하는 올바른 URL을 입력해 주세요."; } }

function clearPreview() { if (previewUrl.value) URL.revokeObjectURL(previewUrl.value); previewUrl.value = ""; dimensions.value = undefined; }
function selectFile(file?: File) {
  error.value = ""; clearPreview(); design.value = undefined;
  if (!file) return;
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 10 * 1024 * 1024) { error.value = "10MB 이하의 PNG 또는 JPG 이미지만 등록할 수 있습니다."; return; }
  const objectUrl = URL.createObjectURL(file); const image = new Image();
  image.onload = () => { design.value = file; previewUrl.value = objectUrl; dimensions.value = { width: image.naturalWidth, height: image.naturalHeight }; };
  image.onerror = () => { URL.revokeObjectURL(objectUrl); error.value = "정상적으로 열 수 있는 디자인 이미지를 선택해 주세요."; };
  image.src = objectUrl;
}
function onFileChange(event: Event) { selectFile((event.target as HTMLInputElement).files?.[0]); }
function onDrop(event: DragEvent) { selectFile(event.dataTransfer?.files?.[0]); }
function submit() {
  error.value = ""; let target: URL;
  try { target = new URL(url.value.trim()); if (!["http:", "https:"].includes(target.protocol)) throw new Error(); }
  catch { error.value = "http:// 또는 https://로 시작하는 올바른 URL을 입력해 주세요."; return; }
  if (!name.value.trim()) { error.value = "검사 이름을 입력해 주세요."; return; }
  emit("submit", { url: target.toString(), name: name.value.trim(), viewportPreset: viewportPreset.value, design: design.value });
}
onBeforeUnmount(clearPreview);
</script>

<template>
  <form class="analysis-form card ui-audit-form" novalidate @submit.prevent="submit">
    <div class="url-composer"><div class="url-control"><input id="ui-audit-url" v-model="url" class="url-input" type="url" inputmode="url" autocomplete="url" placeholder="https://example.com" :readonly="settingsOpen"><button v-if="settingsOpen" class="url-change" type="button" @click="settingsOpen = false">URL 변경</button><button v-else class="primary-button" type="button" @click="openSettings">UI 점검 시작 →</button></div></div>
    <div v-if="settingsOpen" class="analysis-targets settings-panel">
      <header><div><h2>UI 점검 설정</h2><p>화면 크기와 선택 디자인 원본을 확인합니다.</p></div><span>현재 페이지 1개</span></header>
      <section class="input-block"><div class="input-block__head"><label for="ui-audit-name">검사 이름</label><span>필수</span></div><input id="ui-audit-name" v-model="name" class="standalone-input" maxlength="80" placeholder="예: 메인 페이지 데스크톱 UI 점검"></section>
      <section class="input-block"><div class="input-block__head"><label for="ui-audit-viewport">화면 크기</label><span>{{ viewport.width }}×{{ viewport.height }}</span></div><select id="ui-audit-viewport" v-model="viewportPreset" class="standalone-input"><option v-for="item in UI_AUDIT_VIEWPORTS" :key="item.preset" :value="item.preset">{{ item.label }} · {{ item.width }}×{{ item.height }}</option></select></section>
      <section class="input-block"><div class="input-block__head"><span>디자인 원본</span><span>선택 · PNG/JPG 10MB 이하</span></div>
        <label class="design-upload" :class="{ selected: design }" for="ui-design-image" @dragover.prevent @drop.prevent="onDrop"><span class="design-upload__visual"><img v-if="previewUrl" :src="previewUrl" alt="선택한 디자인 미리보기"><b v-else aria-hidden="true">+</b></span><span class="document-upload__copy"><strong>{{ design?.name || "디자인 이미지를 끌어놓거나 선택하세요" }}</strong><small v-if="dimensions">원본 {{ dimensions.width }}×{{ dimensions.height }} · {{ resolutionMatches ? "선택한 화면 크기와 일치" : `선택한 ${viewport.width}×${viewport.height}와 다름` }}</small><small v-else>디자인이 없어도 규칙 기반 UI 점검을 시작할 수 있습니다.</small></span><span class="document-upload__action">{{ design ? "파일 변경" : "이미지 선택" }}</span><input id="ui-design-image" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" @change="onFileChange"></label>
        <p v-if="dimensions && !resolutionMatches" class="input-warning">비율을 강제로 맞추지 않습니다. 실제 비교 단계에서 동일한 화면 크기의 디자인을 사용하는 것을 권장합니다.</p>
      </section>
      <footer class="settings-submit"><span>화면 수집 → 규칙 검사 → 디자인 비교</span><button class="primary-button" type="submit" :disabled="loading">{{ loading ? "점검 준비 중" : "UI 점검 실행" }}</button></footer>
    </div><p v-if="error" class="error-box" role="alert">{{ error }}</p>
  </form>
</template>
