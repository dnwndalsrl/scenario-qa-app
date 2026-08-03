<script setup lang="ts">
import { TEST_ACTION_LABELS } from "../../constants/test-action";
import type { AiExecutableStepDraft } from "../../shared/types/ai-scenario";
import type { TestStep } from "../../shared/types/scenario";

const props = defineProps<{
  drafts: AiExecutableStepDraft[];
  currentSteps: TestStep[];
  reviewedStepIds: string[];
}>();

const emit = defineEmits<{
  "update:reviewedStepIds": [ids: string[]];
}>();

function currentStep(draft: AiExecutableStepDraft): TestStep | undefined {
  return props.currentSteps.find((step) => step.id === draft.temporaryId);
}

function isReviewed(id: string): boolean {
  return props.reviewedStepIds.includes(id);
}

function setReviewed(id: string, reviewed: boolean): void {
  const next = new Set(props.reviewedStepIds);
  if (reviewed) {
    next.add(id);
  } else {
    next.delete(id);
  }
  emit("update:reviewedStepIds", [...next]);
}

function confidenceClass(confidence: number): string {
  if (confidence >= 0.85) {
    return "confidence--high";
  }
  if (confidence >= 0.6) {
    return "confidence--medium";
  }
  return "confidence--low";
}
</script>

<template>
  <section class="content-section">
    <div class="section-heading">
      <div>
        <h2>AI 단계 검토</h2>
        <p>원본 문장과 변환 근거를 확인한 뒤 아래 편집기에서 값을 수정하세요.</p>
      </div>
    </div>

    <div class="ai-review-list">
      <details
        v-for="draft in drafts"
        :key="draft.temporaryId"
        class="ai-review-card"
        :class="{
          'ai-review-card--required': draft.reviewRequired,
          'ai-review-card--removed': !currentStep(draft)
        }"
        :open="draft.reviewRequired"
      >
        <summary>
          <span class="ai-review-card__order">{{ draft.order }}</span>
          <span class="ai-review-card__identity">
            <strong>{{ currentStep(draft)?.name || draft.name }}</strong>
            <small>
              {{
                currentStep(draft)
                  ? TEST_ACTION_LABELS[currentStep(draft)!.action]
                  : "초안에서 제거됨"
              }}
            </small>
          </span>
          <span
            class="confidence-badge"
            :class="confidenceClass(draft.confidence)"
          >
            신뢰도 {{ Math.round(draft.confidence * 100) }}%
          </span>
          <span v-if="draft.reviewRequired" class="review-required-badge">
            ! 검토 필요
          </span>
          <span v-else class="review-complete-badge">✓ 변환 완료</span>
        </summary>

        <div class="ai-review-card__body">
          <dl>
            <div>
              <dt>원본 문장</dt>
              <dd>{{ draft.originalText }}</dd>
            </div>
            <div>
              <dt>변환된 액션</dt>
              <dd>
                {{
                  currentStep(draft)
                    ? TEST_ACTION_LABELS[currentStep(draft)!.action]
                    : "-"
                }}
              </dd>
            </div>
            <div>
              <dt>대상 요소</dt>
              <dd>
                <template v-if="currentStep(draft)?.target">
                  {{ currentStep(draft)!.target!.strategy }} ·
                  {{ currentStep(draft)!.target!.value || "값 없음" }}
                </template>
                <template v-else>-</template>
              </dd>
            </div>
            <div>
              <dt>입력값 / 예상값</dt>
              <dd>
                {{
                  currentStep(draft)?.value ||
                  currentStep(draft)?.expected?.value ||
                  "-"
                }}
              </dd>
            </div>
          </dl>
          <el-alert
            v-if="draft.reviewReason"
            :title="draft.reviewReason"
            type="warning"
            :closable="false"
            show-icon
          />
          <el-checkbox
            v-if="draft.reviewRequired && currentStep(draft)"
            :model-value="isReviewed(draft.temporaryId)"
            @update:model-value="
              setReviewed(draft.temporaryId, Boolean($event))
            "
          >
            이 단계를 검토했습니다.
          </el-checkbox>
          <p v-else-if="!currentStep(draft)" class="field-help">
            삭제된 단계는 저장 대상에 포함되지 않습니다.
          </p>
        </div>
      </details>
    </div>
  </section>
</template>
