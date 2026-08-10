import { z } from "zod";
import type { GeneratedTestAction, GeneratedTestScenario, PageSnapshot } from "../../shared/types/analysis";
import { enforceSafety } from "../analysis/services/test-safety.service";
import { createId } from "../utils/id";

const actionSchema = z.enum(["goto", "assert_url", "assert_title", "assert_visible", "assert_in_viewport", "assert_enabled", "assert_text", "click", "fill", "select", "press", "check", "uncheck"]);

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

export type UpdateGeneratedTestInput = z.infer<typeof updateGeneratedTestSchema>;

const noElementActions = new Set<GeneratedTestAction>(["goto", "assert_url", "assert_title"]);

export function buildEditedScenario(existing: GeneratedTestScenario, snapshot: PageSnapshot, input: UpdateGeneratedTestInput): GeneratedTestScenario {
  const elements = new Map(snapshot.elements.map((element) => [element.id, element]));
  const steps = input.steps.map((step, index) => {
    const needsElement = !noElementActions.has(step.action);
    const element = step.elementId ? elements.get(step.elementId) : undefined;
    if (needsElement && !element) throw new Error(`단계 ${index + 1}의 대상 요소를 선택해 주세요.`);
    const locator = element?.locatorCandidates.find((candidate) => candidate.unique);
    if (needsElement && !locator) throw new Error(`단계 ${index + 1}의 대상 요소에 고유 locator가 없습니다.`);
    return {
      id: createId("step"), order: index + 1, action: step.action, description: step.description,
      elementId: needsElement ? element!.id : undefined, locator: needsElement ? locator : undefined,
      value: step.value || undefined, expected: step.expected || undefined, timeoutMs: step.timeoutMs || undefined,
      evidence: needsElement ? [`사용자 선택 요소: ${element!.id}`] : []
    };
  });
  const sourceElementIds = [...new Set(steps.map((step) => step.elementId).filter((value): value is string => Boolean(value)))];
  return enforceSafety({
    ...existing, title: input.title, description: input.description, purpose: input.purpose, steps, sourceElementIds,
    safetyLevel: "safe", autoExecutable: true,
    revision: (existing.revision || 1) + 1, source: "user", editedAt: new Date().toISOString()
  });
}
