import { z } from "zod";

export const createAnalysisSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  options: z.object({
    mode: z.enum(["single_page", "site_crawl"]).optional(),
    autoRunSafeTests: z.boolean().optional(),
    maxPages: z.number().int().min(1).max(10).optional(),
    maxDepth: z.number().int().min(0).max(3).optional(),
    includeQueryUrls: z.boolean().optional(),
    respectNoFollow: z.boolean().optional(),
    viewport: z.object({ width: z.number().int().min(320).max(2560), height: z.number().int().min(320).max(1600) }).partial().optional(),
    timeoutMs: z.number().int().min(5000).max(120000).optional()
  }).optional()
});

const elementIds = z.array(z.string()).max(20);
export const aiPageAnalysisResponseSchema = z.object({
  pageType: z.enum(["landing", "login", "signup", "search", "list", "detail", "dashboard", "form", "settings", "article", "unknown"]),
  pagePurpose: z.string().min(1).max(500),
  primaryFunctions: z.array(z.object({ id: z.string(), name: z.string().max(120), description: z.string().max(500), relatedElementIds: elementIds, confidence: z.number().min(0).max(1) })).max(20),
  risks: z.array(z.object({ id: z.string(), title: z.string().max(120), description: z.string().max(500), severity: z.enum(["low", "medium", "high"]), relatedElementIds: elementIds })).max(20),
  testOpportunities: z.array(z.object({ id: z.string(), title: z.string().max(120), description: z.string().max(500), relatedElementIds: elementIds })).max(20),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().max(300)).max(10)
});
export const aiSiteAnalysisResponseSchema = z.object({
  sitePurpose: z.string().min(1).max(500),
  primaryUserFlows: z.array(z.object({ name: z.string().min(1).max(120), description: z.string().max(500), pageIds: z.array(z.string()).max(10), confidence: z.number().min(0).max(1), safetyLevel: z.enum(["safe", "review_required", "blocked"]) })).max(10),
  mainPageGroups: z.array(z.object({ name: z.string().min(1).max(120), pageIds: z.array(z.string()).max(20), pageType: z.enum(["landing", "login", "signup", "search", "list", "detail", "dashboard", "form", "settings", "article", "unknown"]).optional() })).max(15),
  coverageSummary: z.string().min(1).max(1000),
  risks: z.array(z.object({ title: z.string().min(1).max(120), description: z.string().max(500), severity: z.enum(["low", "medium", "high"]), pageIds: z.array(z.string()).max(20) })).max(20),
  limitations: z.array(z.string().max(300)).max(10), confidence: z.number().min(0).max(1)
});

export const locatorCandidateSchema = z.object({
  strategy: z.enum(["test_id", "role", "label", "placeholder", "text", "css"]), value: z.string().min(1).max(500), score: z.number().min(0).max(100), unique: z.boolean()
});
export const generatedTestResponseSchema = z.object({
  scenarios: z.array(z.object({
    title: z.string().min(1).max(160), description: z.string().max(500), purpose: z.string().max(500),
    category: z.enum(["page_load", "navigation", "visibility", "accessibility", "form_validation", "search", "interaction", "error_detection"]),
    safetyLevel: z.enum(["safe", "review_required", "blocked"]), confidence: z.number().min(0).max(1), autoExecutable: z.boolean(),
    sourceElementIds: elementIds, requirementIds: elementIds,
    steps: z.array(z.object({
      order: z.number().int().positive(), action: z.enum(["goto", "scroll_to_ratio", "scroll_by", "scroll_into_view", "wait_for_stable", "assert_url", "assert_title", "assert_visible", "assert_in_viewport", "assert_enabled", "assert_text", "click", "fill", "select", "press", "check", "uncheck"]),
      description: z.string().min(1).max(300), elementId: z.string().nullable(), locator: locatorCandidateSchema.nullable(), value: z.string().max(500).nullable(), expected: z.string().max(500).nullable(), timeoutMs: z.number().int().min(1000).max(30000).nullable(), evidence: z.array(z.string().max(300)).max(10)
    })).min(1).max(10)
  })).min(1).max(10)
});

export const requirementDocumentResponseSchema = z.object({
  summary: z.string().max(2000),
  documentType: z.enum(["requirement_spec", "planning_document", "mixed", "unrelated"]),
  qaSuitability: z.enum(["suitable", "review_required", "unsuitable"]),
  confidence: z.number().min(0).max(1),
  requirements: z.array(z.object({
    id: z.string().min(1).max(80), title: z.string().min(1).max(200), description: z.string().max(1000),
    expectedBehavior: z.string().min(1).max(1000), priority: z.enum(["low", "medium", "high"]), sourceReference: z.string().max(300)
  })).max(40),
  limitations: z.array(z.string().max(500)).max(20),
  missingInformation: z.array(z.string().max(500)).max(20)
});
