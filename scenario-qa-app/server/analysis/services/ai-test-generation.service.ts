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
    elements: snapshot.elements.map(({ id, type, tagName, role, accessibleName, label, text, href, inputType, enabled, required, actionable, locatorCandidates, safetyHints, observedStates, inViewportStates }) => ({ id, type, tagName, role, accessibleName, label, text, href, inputType, enabled, required, actionable, locatorCandidates: locatorCandidates.slice(0, 3), safetyHints, observedStates, inViewportStates })),
    stateObservations: snapshot.stateObservations,
    requirements: document?.requirements || [],
    limits: { maxScenarios: config.maxGeneratedScenarios, maxStepsPerScenario: config.maxStepsPerScenario }, testMode: "read_only"
  };
  const raw = await requestStructuredJson({ apiKey: config.openaiApiKey, model: config.testGenerationModel, system: TEST_GENERATION_SYSTEM_PROMPT, input, schema: generatedTestResponseSchema, schemaName: "generated_tests", failureCode: "AI_TEST_GENERATION_FAILED", invalidCode: "AI_TEST_GENERATION_INVALID_RESPONSE" });
  try { return validateGeneratedTestPayload(raw, snapshot, document); }
  catch (error) {
    console.warn(`[qa] AI test validation fallback: ${error instanceof AppError ? error.detail || error.message : String(error)}`);
    return buildFallbackTests(snapshot);
  }
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
      if (repairedStep.action === "click" && element?.actionable === false) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Click target did not pass actionability preflight");
      const numericValue = Number(repairedStep.value);
      if (repairedStep.action === "scroll_to_ratio" && (!repairedStep.value?.trim() || !Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100)) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Invalid scroll ratio");
      if (repairedStep.action === "scroll_by" && (!repairedStep.value?.trim() || !Number.isFinite(numericValue) || numericValue < -10000 || numericValue > 10000)) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Invalid scroll distance");
      if (repairedStep.action === "wait_for_stable" && repairedStep.value?.trim() && (!Number.isFinite(numericValue) || numericValue < 100 || numericValue > 5000)) throw new AppError("AI_TEST_GENERATION_INVALID_RESPONSE", undefined, 502, "Invalid stability wait");
      return { ...repairedStep, elementId: repairedStep.elementId ?? undefined, locator: repairedStep.locator ?? undefined, value: repairedStep.value ?? undefined, expected: inferredClickExpected(repairedStep.action, repairedStep.expected, element?.href, snapshot.finalUrl), timeoutMs: repairedStep.timeoutMs ?? undefined, id: createId("step"), order: index + 1, evidence: [...new Set([...(repairedStep.evidence || []), ...(repairedStep.elementId ? [`근거 요소: ${repairedStep.elementId}`] : [])])] };
    });
    const sourceElementIds = [...new Set([...scenario.sourceElementIds, ...steps.map((step) => step.elementId).filter((id): id is string => Boolean(id))])];
    return enforceSafety({ ...scenario, sourceElementIds, requirementIds: document ? scenario.requirementIds.filter((id) => requirementIds.has(id)) : [], id: createId("test"), analysisId: snapshot.analysisId, pageId: snapshot.pageId, steps, safetyReasons: [], generatedAt: new Date().toISOString() });
  });
}

function repairClickTarget<T extends GeneratedPayload["scenarios"][number]["steps"][number]>(step: T, snapshot: PageSnapshot): T {
  if (step.action !== "click" || !step.elementId) return step;
  const target = snapshot.elements.find((element) => element.id === step.elementId);
  if (!target || isInteractive(target) && target.actionable !== false) return step;
  const targetName = normalizedName(target);
  const replacement = targetName && snapshot.elements.find((element) => isInteractive(element) && element.actionable !== false && normalizedName(element) === targetName && executableClickLocator(element));
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

export function buildFallbackTests(snapshot: PageSnapshot): GeneratedTestScenario[] {
  const config = getAnalysisConfig();
  const internalLinks = snapshot.elements.filter((element) => element.href && element.actionable !== false && isInteractive(element) && executableClickLocator(element) && isMeaningfulInternalLink(element.href, snapshot.finalUrl));
  const visibleElements = snapshot.elements.filter((element) => element.visible && element.locatorCandidates.some((candidate) => candidate.unique));
  const linkScenarios = internalLinks.slice(0, config.maxGeneratedScenarios).map((element) => {
    const locator = executableClickLocator(element)!;
    const name = element.accessibleName || element.text || element.label || "내부 링크";
    return enforceSafety({
      id: createId("test"), analysisId: snapshot.analysisId, pageId: snapshot.pageId,
      title: `${name} 링크 이동 확인`, description: `${name} 링크가 실제 상호작용 요소로 동작하는지 확인합니다.`, purpose: "내부 페이지 이동 검증",
      category: "navigation", safetyLevel: "safe", safetyReasons: [], confidence: .7, autoExecutable: true, sourceElementIds: [element.id], requirementIds: [],
      steps: [
        { id: createId("step"), order: 1, action: "wait_for_stable", description: "페이지가 안정될 때까지 대기", value: "300", evidence: [] },
        { id: createId("step"), order: 2, action: "click", description: `${name} 링크 클릭`, elementId: element.id, locator, expected: inferredClickExpected("click", undefined, element.href, snapshot.finalUrl), evidence: [`근거 요소: ${element.id}`] }
      ], generatedAt: new Date().toISOString()
    });
  });
  if (linkScenarios.length) return linkScenarios;
  return visibleElements.slice(0, config.maxGeneratedScenarios).map((element) => {
    const locator = element.locatorCandidates.find((candidate) => candidate.unique)!;
    const name = element.accessibleName || element.text || element.label || element.id;
    return enforceSafety({
      id: createId("test"), analysisId: snapshot.analysisId, pageId: snapshot.pageId,
      title: `${name} 표시 확인`, description: `${name} 요소가 화면에 표시되는지 확인합니다.`, purpose: "핵심 요소 표시 검증",
      category: "visibility", safetyLevel: "safe", safetyReasons: [], confidence: .65, autoExecutable: true, sourceElementIds: [element.id], requirementIds: [],
      steps: [{ id: createId("step"), order: 1, action: "assert_visible", description: `${name} 표시 확인`, elementId: element.id, locator, evidence: [`근거 요소: ${element.id}`] }],
      generatedAt: new Date().toISOString()
    });
  });
}

function isMeaningfulInternalLink(href: string, pageUrl: string): boolean {
  try {
    const link = new URL(href, pageUrl);
    const page = new URL(pageUrl);
    return link.origin === page.origin && link.pathname !== "/" && (link.pathname !== page.pathname || link.search !== page.search);
  }
  catch { return false; }
}

function inferredClickExpected(action: string, expected: string | null | undefined, href: string | undefined, pageUrl: string): string | undefined {
  if (expected?.trim() || action !== "click" || !href) return expected?.trim() || undefined;
  try {
    const destination = new URL(href, pageUrl);
    const current = new URL(pageUrl);
    const sameDocument = destination.origin === current.origin && destination.pathname.replace(/\/$/, "") === current.pathname.replace(/\/$/, "") && destination.search === current.search;
    if (sameDocument && destination.hash) return `scroll:${destination.hash}`;
    if (!sameDocument) return `url-prefix:${destination.href}`;
  } catch { /* 검증할 수 없는 href는 기존 클릭 동작을 유지합니다. */ }
  return undefined;
}
