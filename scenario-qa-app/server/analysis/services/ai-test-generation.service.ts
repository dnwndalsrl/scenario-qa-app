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
      const repairedStep = repairClickTarget(step, snapshot);
      const element = repairedStep.elementId ? elements.get(repairedStep.elementId) : undefined;
      if (step.elementId && !element) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Unknown step element id");
      const discoveredLocator = repairedStep.locator && element?.locatorCandidates.find((candidate) => candidate.strategy === repairedStep.locator!.strategy && candidate.value === repairedStep.locator!.value);
      const equivalentHrefClick = repairedStep.action === "click" && discoveredLocator?.strategy === "css" && discoveredLocator.value.includes("[href");
      if (repairedStep.locator && (!discoveredLocator || !discoveredLocator.unique && !equivalentHrefClick)) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Locator was not discovered or is not executable");
      if (repairedStep.action === "click" && element && !isInteractive(element)) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Click target is not interactive");
      const numericValue = Number(repairedStep.value);
      if (repairedStep.action === "scroll_to_ratio" && (!repairedStep.value?.trim() || !Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100)) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Invalid scroll ratio");
      if (repairedStep.action === "scroll_by" && (!repairedStep.value?.trim() || !Number.isFinite(numericValue) || numericValue < -10000 || numericValue > 10000)) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Invalid scroll distance");
      if (repairedStep.action === "wait_for_stable" && repairedStep.value?.trim() && (!Number.isFinite(numericValue) || numericValue < 100 || numericValue > 5000)) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Invalid stability wait");
      return { ...repairedStep, elementId: repairedStep.elementId ?? undefined, locator: repairedStep.locator ?? undefined, value: repairedStep.value ?? undefined, expected: repairedStep.expected ?? undefined, timeoutMs: repairedStep.timeoutMs ?? undefined, id: createId("step"), order: index + 1, evidence: [...new Set([...(repairedStep.evidence || []), ...(repairedStep.elementId ? [`근거 요소: ${repairedStep.elementId}`] : [])])] };
    });
    const sourceElementIds = [...new Set([...scenario.sourceElementIds, ...steps.map((step) => step.elementId).filter((id): id is string => Boolean(id))])];
    return enforceSafety({ ...scenario, sourceElementIds, requirementIds: document ? scenario.requirementIds.filter((id) => requirementIds.has(id)) : [], id: createId("test"), analysisId: snapshot.analysisId, pageId: snapshot.pageId, steps, safetyReasons: [], generatedAt: new Date().toISOString() });
  });
}

function repairClickTarget<T extends GeneratedPayload["scenarios"][number]["steps"][number]>(step: T, snapshot: PageSnapshot): T {
  if (step.action !== "click" || !step.elementId) return step;
  const target = snapshot.elements.find((element) => element.id === step.elementId);
  if (!target || isInteractive(target)) return step;
  const targetName = normalizedName(target);
  const replacement = targetName && snapshot.elements.find((element) => isInteractive(element) && normalizedName(element) === targetName && executableClickLocator(element));
  const locator = replacement && executableClickLocator(replacement);
  return replacement && locator ? { ...step, elementId: replacement.id, locator } : step;
}

function executableClickLocator(element: PageSnapshot["elements"][number]) {
  return element.locatorCandidates.find((candidate) => candidate.strategy === "css" && candidate.value.includes("[href"))
    || element.locatorCandidates.find((candidate) => candidate.unique);
}

function normalizedName(element: PageSnapshot["elements"][number]): string {
  return (element.accessibleName || element.text || element.label || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function isInteractive(element: PageSnapshot["elements"][number]): boolean {
  return ["a", "button", "input", "select", "textarea"].includes(element.tagName) || ["link", "button", "tab"].includes(element.role || "");
}
