import type { AiPageAnalysis, PageSnapshot, RequirementDocumentAnalysis } from "../../../shared/types/analysis";
import { aiPageAnalysisResponseSchema } from "../../../shared/schemas/analysis";
import { getAnalysisConfig } from "../../config";
import { createId } from "../../utils/id";
import { PAGE_ANALYSIS_SYSTEM_PROMPT } from "../prompts/page-analysis.prompt";
import { requestStructuredJson } from "./openai-json.service";

export async function analyzePageWithAi(snapshot: PageSnapshot, document?: RequirementDocumentAnalysis): Promise<AiPageAnalysis> {
  const config = getAnalysisConfig();
  const input = {
    url: snapshot.finalUrl, title: snapshot.title, description: snapshot.description, language: snapshot.language, headings: snapshot.headings,
    elements: snapshot.elements.map(({ id, type, role, accessibleName, label, text, placeholder, href, inputType, enabled, required, safetyHints, observedStates, inViewportStates }) => ({ id, type, role, accessibleName, label, text, placeholder, href, inputType, enabled, required, safetyHints, observedStates, inViewportStates })),
    stateObservations: snapshot.stateObservations,
    forms: snapshot.forms, internalLinks: snapshot.internalLinks,
    consoleIssueSummary: snapshot.consoleMessages.map(({ type, text }) => ({ type, text })).slice(0, 30),
    networkIssueSummary: snapshot.networkIssues.map(({ url, method, resourceType, status, failureText }) => ({ url, method, resourceType, status, failureText })).slice(0, 30),
    requirements: document?.requirements || [], requirementSummary: document?.summary
  };
  const raw = await requestStructuredJson({ apiKey: config.openaiApiKey, model: config.pageAnalysisModel, system: PAGE_ANALYSIS_SYSTEM_PROMPT, input, schema: aiPageAnalysisResponseSchema, schemaName: "page_analysis", failureCode: "AI_PAGE_ANALYSIS_FAILED", invalidCode: "AI_PAGE_ANALYSIS_INVALID_RESPONSE" });
  const ids = new Set(snapshot.elements.map((element) => element.id));
  const filterIds = (values: string[]) => values.filter((id) => ids.has(id));
  return {
    id: createId("page-analysis"), analysisId: snapshot.analysisId, pageId: snapshot.pageId, ...raw,
    primaryFunctions: raw.primaryFunctions.map((item) => ({ ...item, relatedElementIds: filterIds(item.relatedElementIds) })).filter((item) => item.relatedElementIds.length > 0),
    risks: raw.risks.map((item) => ({ ...item, relatedElementIds: filterIds(item.relatedElementIds) })),
    testOpportunities: raw.testOpportunities.map((item) => ({ ...item, relatedElementIds: filterIds(item.relatedElementIds) })).filter((item) => item.relatedElementIds.length > 0),
    model: config.pageAnalysisModel, promptVersion: config.pageAnalysisPromptVersion, inputCharacters: JSON.stringify(input).length, generatedAt: new Date().toISOString()
  };
}
