import { z } from "zod";
import type { GeneratedTestAction, GeneratedTestScenario, PageSnapshot } from "../../shared/types/analysis";
import { enforceSafety } from "../analysis/services/test-safety.service";
import { createId } from "../utils/id";

const actionSchema = z.enum(["goto", "scroll_to_ratio", "scroll_by", "scroll_into_view", "wait_for_stable", "assert_url", "assert_title", "assert_visible", "assert_in_viewport", "assert_scroll", "assert_enabled", "assert_text", "click", "fill", "select", "press", "check", "uncheck"]);

export const updateGeneratedTestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500),
  purpose: z.string().trim().max(500),
  steps: z.array(z.object({
    action: actionSchema,
    description: z.string().trim().min(1).max(300),
    elementId: z.string().trim().min(1).max(100).nullable().optional(),
    value: z.string().max(500).nullable().optional(),
    expected: z.string().max(500).nullable().optional(),
    timeoutMs: z.number().int().min(1000).max(30000).nullable().optional()
  })).min(1).max(10)
});
export const createGeneratedTestSchema = updateGeneratedTestSchema.extend({ pageId: z.string().trim().min(1).max(100).nullable().optional() });

export type UpdateGeneratedTestInput = z.infer<typeof updateGeneratedTestSchema>;
export type CreateGeneratedTestInput = z.infer<typeof createGeneratedTestSchema>;

const noElementActions = new Set<GeneratedTestAction>(["goto", "scroll_to_ratio", "scroll_by", "assert_url", "assert_title", "assert_scroll"]);
const optionalElementActions = new Set<GeneratedTestAction>(["wait_for_stable"]);

export function buildEditedScenario(existing: GeneratedTestScenario, snapshot: PageSnapshot, input: UpdateGeneratedTestInput): GeneratedTestScenario {
  const elements = new Map(snapshot.elements.map((element) => [element.id, element]));
  const steps = input.steps.map((step, index) => {
    const needsElement = !noElementActions.has(step.action) && !optionalElementActions.has(step.action);
    validateDynamicStepValue(step, index);
    const element = step.elementId ? elements.get(step.elementId) : undefined;
    if (step.elementId && !element) throw new Error(`단계 ${index + 1}의 대상 요소를 찾을 수 없습니다.`);
    if (needsElement && !element) throw new Error(`단계 ${index + 1}의 대상 요소를 선택해 주세요.`);
    const locator = element?.locatorCandidates.find((candidate) => candidate.unique);
    if ((needsElement || element) && !locator) throw new Error(`단계 ${index + 1}의 대상 요소에 고유 locator가 없습니다.`);
    return {
      id: createId("step"), order: index + 1, action: step.action, description: step.description,
      elementId: element?.id, locator,
      value: step.value || undefined, expected: step.expected || undefined, timeoutMs: step.timeoutMs || undefined,
      evidence: element ? [`사용자 선택 요소: ${element.id}`] : []
    };
  });
  const sourceElementIds = [...new Set(steps.map((step) => step.elementId).filter((value): value is string => Boolean(value)))];
  if (!steps.some((step) => step.action.startsWith("assert_"))) throw new Error("예상 결과 확인 단계를 1개 이상 추가해 주세요.");
  return enforceSafety({
    ...existing, title: input.title, description: input.description, purpose: input.purpose, steps, sourceElementIds,
    safetyLevel: "safe", autoExecutable: true,
    revision: existing.revision === 0 ? 1 : (existing.revision || 1) + 1, source: "user", editedAt: new Date().toISOString()
  });
}

function validateDynamicStepValue(step: UpdateGeneratedTestInput["steps"][number], index: number) {
  const value = Number(step.value);
  if (step.action === "scroll_to_ratio" && (!step.value?.trim() || !Number.isFinite(value) || value < 0 || value > 100)) throw new Error(`단계 ${index + 1}의 스크롤 비율은 0~100 사이 숫자여야 합니다.`);
  if (step.action === "scroll_by" && (!step.value?.trim() || !Number.isFinite(value) || value < -10000 || value > 10000)) throw new Error(`단계 ${index + 1}의 스크롤 이동값은 -10000~10000 사이 숫자여야 합니다.`);
  if (step.action === "wait_for_stable" && step.value?.trim() && (!Number.isFinite(value) || value < 100 || value > 5000)) throw new Error(`단계 ${index + 1}의 안정 유지 시간은 100~5000ms 사이 숫자여야 합니다.`);
}

export function buildAddedScenario(analysisId: string, snapshot: PageSnapshot, input: CreateGeneratedTestInput): GeneratedTestScenario {
  const now = new Date().toISOString();
  return buildEditedScenario({
    id: createId("test"), analysisId, pageId: snapshot.pageId, title: input.title, description: input.description, purpose: input.purpose,
    category: "interaction", safetyLevel: "safe", safetyReasons: [], confidence: 1, autoExecutable: true,
    sourceElementIds: [], steps: [], generatedAt: now, revision: 0, source: "user", requirementIds: []
  }, snapshot, input);
}
