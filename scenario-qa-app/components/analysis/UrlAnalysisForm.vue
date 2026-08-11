<script setup lang="ts">
interface SubmitPayload { url: string; document?: File }
const emit = defineEmits<{ submit: [payload: SubmitPayload] }>();
defineProps<{ loading?: boolean }>();
const url = ref("");
const error = ref("");
const document = ref<File>();

function selectDocument(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  error.value = "";
  if (!file) { document.value = undefined; return; }
  if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) {
    error.value = "10MB ?댄븯??PDF ?뚯씪留??깅줉?????덉뒿?덈떎.";
    (event.target as HTMLInputElement).value = "";
    return;
  }
  document.value = file;
}
function submit() {
  error.value = "";
  try { const parsed = new URL(url.value.trim()); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); }
  catch { error.value = "http:// ?먮뒗 https://濡??쒖옉?섎뒗 ?щ컮瑜?URL???낅젰??二쇱꽭??"; return; }
  emit("submit", { url: url.value.trim(), document: document.value });
}
</script>

<template>
  <form class="analysis-form card" @submit.prevent="submit">
    <header class="analysis-form__head">
      <div><span>??遺꾩꽍</span><h2>遺꾩꽍????곸쓣 ?깅줉?섏꽭??/h2><p>URL? ?꾩닔?대ŉ, 湲고쉷 臾몄꽌???꾩슂??寃쎌슦?먮쭔 泥⑤??섎㈃ ?⑸땲??</p></div>
      <div class="scope-chip"><i aria-hidden="true" />?꾩옱 ?섏씠吏 1媛?/div>
    </header>
    <div class="analysis-targets">
      <section class="input-block">
        <div class="input-block__head"><label for="analysis-url">?뚯뒪?명븷 ?섏씠吏 URL</label><span>?꾩닔</span></div>
        <div class="url-control"><span class="url-control__icon" aria-hidden="true">??/span><input id="analysis-url" v-model="url" class="url-input" type="url" inputmode="url" autocomplete="url" placeholder="https://example.com" data-testid="analysis-url-input"><button class="primary-button" type="submit" :disabled="loading" data-testid="start-analysis-button"><span>{{ loading ? "遺꾩꽍??以鍮꾪븯??以묅? : "遺꾩꽍 ?쒖옉" }}</span><span aria-hidden="true">??/span></button></div>
      </section>
      <section class="input-block">
        <div class="input-block__head"><span>湲고쉷?쑣룹슂援ъ궗??/span><span>?좏깮 쨌 PDF 10MB ?댄븯</span></div>
        <label class="document-upload" :class="{ selected: document }" for="requirements-pdf">
          <span class="document-upload__icon" aria-hidden="true">PDF</span>
          <span class="document-upload__copy"><strong>{{ document?.name || "?붽뎄?ы빆 臾몄꽌瑜??④퍡 遺꾩꽍?좉퉴??" }}</strong><small>{{ document ? "?좏깮??臾몄꽌瑜??섏씠吏 遺꾩꽍???④퍡 諛섏쁺?⑸땲??" : "?먯쑀 ?뺤떇 PDF??媛?ν븯硫? 臾몄꽌媛 ?놁뼱???섏씠吏 遺꾩꽍???쒖옉?????덉뒿?덈떎." }}</small></span>
          <span class="document-upload__action">{{ document ? "?뚯씪 蹂寃? : "PDF ?좏깮" }}</span>
          <input id="requirements-pdf" type="file" accept="application/pdf,.pdf" @change="selectDocument">
        </label>
      </section>
    </div>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
  </form>
</template>
