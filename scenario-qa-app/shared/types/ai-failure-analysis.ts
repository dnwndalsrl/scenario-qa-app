import type { JsonValue } from "./test-run.js";

export const AI_FAILURE_ANALYSIS_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed"
] as const;

export const AI_FAILURE_ANALYSIS_ERROR_CODES = [
  "TEST_RUN_NOT_FOUND",
  "TEST_RUN_NOT_COMPLETED",
  "AI_ANALYSIS_NOT_ALLOWED",
  "AI_ANALYSIS_IN_PROGRESS",
  "AI_ANALYSIS_ALREADY_EXISTS",
  "AI_ANALYSIS_NOT_FOUND",
  "AI_ANALYSIS_INPUT_EMPTY",
  "AI_ANALYSIS_INPUT_TOO_LARGE",
  "AI_ANALYSIS_PROVIDER_ERROR",
  "AI_ANALYSIS_TIMEOUT",
  "AI_ANALYSIS_INVALID_RESPONSE",
  "AI_ANALYSIS_FAILED",
  "AI_ANALYSIS_EVIDENCE_INVALID"
] as const;

export type AiFailureAnalysisErrorCode =
  (typeof AI_FAILURE_ANALYSIS_ERROR_CODES)[number];

export type AiFailureAnalysisStatus =
  (typeof AI_FAILURE_ANALYSIS_STATUSES)[number];

export const FAILURE_CATEGORIES = [
  "element_not_found",
  "element_not_visible",
  "element_not_enabled",
  "multiple_elements_found",
  "url_mismatch",
  "text_mismatch",
  "input_value_mismatch",
  "navigation_timeout",
  "action_timeout",
  "network_failure",
  "http_client_error",
  "http_server_error",
  "console_error",
  "authentication_failure",
  "authorization_failure",
  "frontend_state_issue",
  "api_response_issue",
  "rendering_issue",
  "environment_issue",
  "test_data_issue",
  "scenario_issue",
  "selector_issue",
  "unknown"
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export const ANALYSIS_PRIORITIES = [
  "critical",
  "high",
  "medium",
  "low"
] as const;

export type AnalysisPriority = (typeof ANALYSIS_PRIORITIES)[number];

export const ANALYSIS_TARGET_ROLES = [
  "frontend",
  "backend",
  "qa",
  "planning",
  "infrastructure",
  "unknown"
] as const;

export type AnalysisTargetRole =
  (typeof ANALYSIS_TARGET_ROLES)[number];

export type EvidenceType =
  | "run_error"
  | "step_result"
  | "console_error"
  | "network_error"
  | "screenshot_metadata";

export interface AnalysisEvidence {
  id: string;
  type: EvidenceType;
  description: string;
  stepId?: string;
  timestamp?: string;
  value: Record<string, JsonValue>;
}

export interface ConfirmedFact {
  id: string;
  description: string;
  evidenceIds: string[];
}

export interface SuspectedCause {
  id: string;
  title: string;
  description: string;
  category: FailureCategory;
  confidence: number;
  evidenceIds: string[];
  counterEvidenceIds: string[];
  verificationMethod: string;
  targetRole: AnalysisTargetRole;
}

export interface ReproductionStep {
  order: number;
  description: string;
  sourceStepId?: string;
  isFailurePoint: boolean;
}

export interface RecommendedAction {
  id: string;
  title: string;
  description: string;
  priority: AnalysisPriority;
  targetRole: AnalysisTargetRole;
  relatedCauseIds: string[];
}

export interface AdditionalCheck {
  id: string;
  question: string;
  reason: string;
  relatedCauseIds: string[];
}

export interface EvidenceReference {
  evidenceId: string;
  relevance: string;
}

export interface AiFailureAnalysisResult {
  summary: string;
  confirmedFacts: ConfirmedFact[];
  suspectedCauses: SuspectedCause[];
  reproductionSteps: ReproductionStep[];
  recommendedActions: RecommendedAction[];
  additionalChecks: AdditionalCheck[];
  relatedEvidence: EvidenceReference[];
  limitations: string[];
  overallConfidence: number;
}

export interface AiFailureAnalysis {
  id: string;
  runId: string;
  projectId: string;
  scenarioId: string;
  status: AiFailureAnalysisStatus;
  model: string;
  promptVersion: string;
  inputFingerprint: string;
  evidence: AnalysisEvidence[];
  result?: AiFailureAnalysisResult;
  errorCode?: string;
  errorMessage?: string;
  inputTokenCount?: number;
  outputTokenCount?: number;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiFailureAnalysisAccepted {
  analysisId: string;
  runId: string;
  status: AiFailureAnalysisStatus;
  reused: boolean;
}
