import { z } from "zod";
import type { GeneratedTestScenario } from "../../shared/types/analysis";
import { AppError } from "../../shared/errors";

export const scenarioRequirementLinksSchema = z.object({
  requirementIds: z.array(z.string().trim().min(1).max(80)).max(40).transform((ids) => [...new Set(ids)])
});

export function applyScenarioRequirementLinks(scenario: GeneratedTestScenario, availableRequirementIds: string[], requirementIds: string[]): GeneratedTestScenario {
  const available = new Set(availableRequirementIds);
  const invalid = requirementIds.find((id) => !available.has(id));
  if (invalid) throw new AppError("REQUIREMENT_NOT_FOUND", `요구사항 ${invalid}을(를) 문서에서 찾을 수 없습니다.`, 400);
  return { ...scenario, requirementIds: [...new Set(requirementIds)] };
}
