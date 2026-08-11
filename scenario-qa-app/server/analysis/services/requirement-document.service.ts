import { PDFParse } from "pdf-parse";
import type { RequirementDocumentAnalysis } from "../../../shared/types/analysis";
import { requirementDocumentResponseSchema } from "../../../shared/schemas/analysis";
import { getAnalysisConfig } from "../../config";
import { REQUIREMENT_DOCUMENT_SYSTEM_PROMPT } from "../prompts/requirement-document.prompt";
import { requestStructuredJson } from "./openai-json.service";

export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pageCount: number }> {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return { text: result.text.trim(), pageCount: result.total };
  } finally { await parser.destroy(); }
}

export async function analyzeRequirementDocument(bytes: Uint8Array, fileName: string): Promise<RequirementDocumentAnalysis> {
  const extracted = await extractPdfText(bytes);
  if (extracted.text.length < 20) throw new Error("PDF에서 분석 가능한 텍스트를 찾지 못했습니다. 이미지 PDF는 OCR 처리 후 다시 등록해 주세요.");
  const text = extracted.text.slice(0, 60000);
  const config = getAnalysisConfig();
  const result = await requestStructuredJson({
    apiKey: config.openaiApiKey, model: config.pageAnalysisModel, system: REQUIREMENT_DOCUMENT_SYSTEM_PROMPT,
    input: { fileName, pageCount: extracted.pageCount, documentText: text }, schema: requirementDocumentResponseSchema,
    schemaName: "requirement_document", failureCode: "AI_DOCUMENT_ANALYSIS_FAILED", invalidCode: "AI_DOCUMENT_ANALYSIS_INVALID_RESPONSE"
  });
  return { fileName, status: "completed", ...result, pageCount: extracted.pageCount, extractedCharacters: text.length, analyzedAt: new Date().toISOString() };
}
