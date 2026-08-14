import type { AiPageAnalysis, GeneratedTestScenario, PageSnapshot, RequirementDocumentAnalysis } from "../../../shared/types/analysis";
import { generatedTestResponseSchema } from "../../../shared/schemas/analysis";
import { AppError } from "../../../shared/errors";
import { getAnalysisConfig } from "../../config";
import { createId } from "../../utils/id";
import { TEST_GENERATION_SYSTEM_PROMPT } from "../prompts/test-generation.prompt";
import { requestStructuredJson } from "./openai-json.service";
import { enforceSafety } from "./test-safety.service";
import type { z } from "zod";

type GeneratedPayload = z.infer<typeof generatedTestResponseSchema>;

export async function generateTestsWithAi(snapshot: PageSnapshot, analysis: AiPageAnalysis, document?: RequirementDocumentAnalysis): Promise<GeneratedTestScenario[]> {
  const config = getAnalysisConfig();
  const input = {
    page: { url: snapshot.finalUrl, title: snapshot.title, headings: snapshot.headings, pageType: analysis.pageType, purpose: analysis.pagePurpose },
    functions: analysis.primaryFunctions, opportunities: analysis.testOpportunities,
    elements: snapshot.elements.map(({ id, type, tagName, role, accessibleName, label, text, href, inputType, enabled, required, locatorCandidates, safetyHints, observedStates, inViewportStates }) => ({ id, type, tagName, role, accessibleName, label, text, href, inputType, enabled, required, locatorCandidates: locatorCandidates.slice(0, 3), safetyHints, observedStates, inViewportStates })),
    stateObservations: snapshot.stateObservations,
    requirements: document?.requirements || [],
    limits: { maxScenarios: config.maxGeneratedScenarios, maxStepsPerScenario: config.maxStepsPerScenario }, testMode: "read_only"
  };
  const raw = await requestStructuredJson({ apiKey: config.openaiApiKey, model: config.testGenerationModel, system: TEST_GENERATION_SYSTEM_PROMPT, input, schema: generatedTestResponseSchema, schemaName: "generated_tests", failureCode: "AI_TEST_GENERATION_FAILED", invalidCode: "AI_TEST_GENERATION_INVALID_RESPONSE" });
  return validateGeneratedTestPayload(raw, snapshot, document);
}

export function validateGeneratedTestPayload(raw: GeneratedPayload, snapshot: PageSnapshot, document?: RequirementDocumentAnalysis): GeneratedTestScenario[] {
  const config = getAnalysisConfig();
  const elements = new Map(snapshot.elements.map((element) => [element.id, element]));
  const requirementIds = new Set(document?.requirements.map((item) => item.id) || []);
  return raw.scenarios.slice(0, config.maxGeneratedScenarios).map((scenario) => {
    if (scenario.sourceElementIds.some((id) => !elements.has(id))) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Unknown source element id");
    const steps = scenario.steps.slice(0, config.maxStepsPerScenario).map((step, index) => {
      const element = step.elementId ? elements.get(step.elementId) : undefined;
      if (step.elementId && !element) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Unknown step element id");
      const discoveredLocator = step.locator && element?.locatorCandidates.find((candidate) => candidate.strategy === step.locator!.strategy && candidate.value === step.locator!.value);
      const equivalentHrefClick = step.action === "click" && discoveredLocator?.strategy === "css" && discoveredLocator.value.includes("[href");
      if (step.locator && (!discoveredLocator || !discoveredLocator.unique && !equivalentHrefClick)) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Locator was not discovered or is not executable");
      if (step.action === "click" && element && !["a", "button", "input", "select", "textarea"].includes(element.tagName) && !["link", "button", "tab"].includes(element.role || "")) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Click target is not interactive");
      const numericValue = Number(step.value);
      if (step.action === "scroll_to_ratio" && (!step.value?.trim() || !Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100)) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Invalid scroll ratio");
      if (step.action === "scroll_by" && (!step.value?.trim() || !Number.isFinite(numericValue) || numericValue < -10000 || numericValue > 10000)) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Invalid scroll distance");
      if (step.action === "wait_for_stable" && step.value?.trim() && (!Number.isFinite(numericValue) || numericValue < 100 || numericValue > 5000)) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Invalid stability wait");
      return { ...step, elementId: step.elementId ?? undefined, locator: step.locator ?? undefined, value: step.value ?? undefined, expected: step.expected ?? undefined, timeoutMs: step.timeoutMs ?? undefined, id: createId("step"), order: index + 1, evidence: [...new Set([...(step.evidence || []), ...(step.elementId ? [`근거 요소: ${step.elementId}`] : [])])] };
    });
    return enforceSafety({ ...scenario, requirementIds: document ? scenario.requirementIds.filter((id) => requirementIds.has(id)) : [], id: createId("test"), analysisId: snapshot.analysisId, pageId: snapshot.pageId, steps, safetyReasons: [], generatedAt: new Date().toISOString() });
  });
}
