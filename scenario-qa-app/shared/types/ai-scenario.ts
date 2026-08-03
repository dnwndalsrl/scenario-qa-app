import type {
  ElementTarget,
  TestAction,
  TestStep,
  UrlExpectation
} from "./scenario.js";

export const AI_CONVERSION_STATUSES = [
  "pending",
  "processing",
  "review_required",
  "saved",
  "failed"
] as const;

export type AiConversionStatus =
  (typeof AI_CONVERSION_STATUSES)[number];

export type AiDraftAction = TestAction | "unsupported";

export type AiMissingInformationType =
  | "missing_url"
  | "missing_target"
  | "missing_value"
  | "missing_expected_result"
  | "missing_environment_variable"
  | "ambiguous_action"
  | "ambiguous_target";

export interface AiConversionWarning {
  code: string;
  stepTemporaryId?: string;
  message: string;
  suggestedAction?: string;
}

export interface AiMissingInformation {
  type: AiMissingInformationType;
  field: string;
  stepTemporaryId?: string;
  message: string;
  suggestedAction: string;
}

export interface AiUnsupportedStep {
  temporaryId: string;
  order: number;
  originalText: string;
  reason: string;
  suggestion: string;
}

export interface AiAssumption {
  stepTemporaryId?: string;
  description: string;
}

export interface AiExecutableStepDraft {
  temporaryId: string;
  order: number;
  name: string;
  originalText: string;
  action: TestAction;
  target?: ElementTarget;
  value?: string;
  expected?: UrlExpectation;
  timeout: number;
  required: boolean;
  confidence: number;
  reviewRequired: boolean;
  reviewReason?: string;
}

export interface AiScenarioDraft {
  name: string;
  description?: string;
  startUrl: string;
  stopOnFailure: boolean;
  timeout: number;
  steps: AiExecutableStepDraft[];
}

export interface AiScenarioConversionRequest {
  projectId: string;
  name: string;
  description?: string;
  startUrl: string;
  naturalLanguage: string;
  stopOnFailure: boolean;
  timeout: number;
  availableEnvironmentVariables: string[];
  additionalContext?: string;
}

export interface AiConversionSummary {
  originalStepCount: number;
  convertedStepCount: number;
  reviewRequiredCount: number;
  warningCount: number;
  missingInformationCount: number;
  unsupportedCount: number;
  averageConfidence: number;
}

export interface AiScenarioConversionResult {
  conversionId: string;
  status: "review_required";
  scenarioDraft: AiScenarioDraft;
  warnings: AiConversionWarning[];
  missingInformation: AiMissingInformation[];
  unsupportedSteps: AiUnsupportedStep[];
  assumptions: AiAssumption[];
  summary: AiConversionSummary;
}

export interface AiScenarioConversion {
  id: string;
  projectId: string;
  scenarioId?: string;
  name: string;
  naturalLanguage: string;
  status: AiConversionStatus;
  model: string;
  promptVersion: string;
  availableEnvironmentVariables: string[];
  inputTokenCount?: number;
  outputTokenCount?: number;
  scenarioDraft?: AiScenarioDraft;
  warnings: AiConversionWarning[];
  missingInformation: AiMissingInformation[];
  unsupportedSteps: AiUnsupportedStep[];
  assumptions: AiAssumption[];
  failureCode?: string;
  failureMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiScenarioSaveMetadata {
  conversionId: string;
  reviewedStepIds: string[];
  unsupportedStepsConfirmed: boolean;
}

export function aiDraftStepToTestStep(
  draft: AiExecutableStepDraft
): TestStep {
  return {
    id: draft.temporaryId,
    order: draft.order,
    name: draft.name,
    action: draft.action,
    ...(draft.target === undefined
      ? {}
      : { target: { ...draft.target } }),
    ...(draft.value === undefined ? {} : { value: draft.value }),
    ...(draft.expected === undefined
      ? {}
      : { expected: { ...draft.expected } }),
    timeout: draft.timeout,
    required: draft.required
  };
}
