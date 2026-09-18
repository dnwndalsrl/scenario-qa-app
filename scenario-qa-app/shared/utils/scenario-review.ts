import type { GeneratedTestScenario } from "../types/analysis";

export function isScenarioIncluded(scenario: GeneratedTestScenario): boolean {
  return scenario.reviewDisposition !== "excluded";
}

export function isScenarioReviewEligible(scenario: GeneratedTestScenario): boolean {
  return isScenarioIncluded(scenario)
    && scenario.safetyLevel === "safe"
    && scenario.autoExecutable
    && scenario.steps.some((step) => step.action.startsWith("assert_"));
}
