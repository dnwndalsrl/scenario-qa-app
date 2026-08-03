import { z } from "zod";
import {
  ANALYSIS_PRIORITIES,
  ANALYSIS_TARGET_ROLES,
  FAILURE_CATEGORIES,
  type AiFailureAnalysisResult
} from "../../../shared/types/ai-failure-analysis.js";
import type { AiFailureAnalysisLimits } from "../types/ai-failure-analysis.js";

const idSchema = z.string().min(1).max(100);
const shortTextSchema = z.string().min(1).max(500);
const descriptionSchema = z.string().min(1).max(2000);

const confirmedFactSchema = z
  .object({
    id: idSchema,
    description: descriptionSchema,
    evidenceIds: z.array(idSchema).min(1).max(20)
  })
  .strict();

const suspectedCauseSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1).max(200),
    description: descriptionSchema,
    category: z.enum(FAILURE_CATEGORIES),
    confidence: z.number().min(0).max(1),
    evidenceIds: z.array(idSchema).min(1).max(20),
    counterEvidenceIds: z.array(idSchema).max(20),
    verificationMethod: descriptionSchema,
    targetRole: z.enum(ANALYSIS_TARGET_ROLES)
  })
  .strict();

const reproductionStepSchema = z
  .object({
    order: z.number().int().positive(),
    description: descriptionSchema,
    sourceStepId: z.string().max(100).nullable(),
    isFailurePoint: z.boolean()
  })
  .strict();

const recommendedActionSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1).max(200),
    description: descriptionSchema,
    priority: z.enum(ANALYSIS_PRIORITIES),
    targetRole: z.enum(ANALYSIS_TARGET_ROLES),
    relatedCauseIds: z.array(idSchema).max(10)
  })
  .strict();

const additionalCheckSchema = z
  .object({
    id: idSchema,
    question: shortTextSchema,
    reason: descriptionSchema,
    relatedCauseIds: z.array(idSchema).max(10)
  })
  .strict();

const evidenceReferenceSchema = z
  .object({
    evidenceId: idSchema,
    relevance: descriptionSchema
  })
  .strict();

export const AiFailureAnalysisStructuredOutputSchema = z
  .object({
    summary: z.string().min(1).max(2000),
    confirmedFacts: z.array(confirmedFactSchema).max(30),
    suspectedCauses: z.array(suspectedCauseSchema),
    reproductionSteps: z.array(reproductionStepSchema).max(100),
    recommendedActions: z.array(recommendedActionSchema),
    additionalChecks: z.array(additionalCheckSchema),
    relatedEvidence: z.array(evidenceReferenceSchema).max(60),
    limitations: z.array(z.string().min(1).max(1000)).max(30),
    overallConfidence: z.number().min(0).max(1)
  })
  .strict();

export type AiFailureAnalysisProviderResponse = z.infer<
  typeof AiFailureAnalysisStructuredOutputSchema
>;

export class AiFailureAnalysisSchemaError extends Error {
  override readonly name = "AiFailureAnalysisSchemaError";

  constructor(
    readonly code:
      | "AI_ANALYSIS_INVALID_RESPONSE"
      | "AI_ANALYSIS_EVIDENCE_INVALID",
    readonly issues: string[]
  ) {
    super("AI 실패 분석 응답이 허용된 스키마와 일치하지 않습니다.");
  }
}

export function parseAiFailureAnalysisResponse(
  value: unknown,
  evidenceIds: ReadonlySet<string>,
  limits: Pick<
    AiFailureAnalysisLimits,
    "maxCauses" | "maxActions" | "maxChecks"
  >
): AiFailureAnalysisResult {
  const parsed = AiFailureAnalysisStructuredOutputSchema.safeParse(value);
  if (!parsed.success) {
    throw new AiFailureAnalysisSchemaError(
      "AI_ANALYSIS_INVALID_RESPONSE",
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "response"}: ${issue.message}`
      )
    );
  }

  const data = parsed.data;
  const issues: string[] = [];
  const evidenceIssues: string[] = [];
  if (data.suspectedCauses.length > limits.maxCauses) {
    issues.push(`원인 후보는 최대 ${limits.maxCauses}개입니다.`);
  }
  if (data.recommendedActions.length > limits.maxActions) {
    issues.push(`권장 조치는 최대 ${limits.maxActions}개입니다.`);
  }
  if (data.additionalChecks.length > limits.maxChecks) {
    issues.push(`추가 확인 사항은 최대 ${limits.maxChecks}개입니다.`);
  }

  validateUniqueIds(
    data.confirmedFacts.map((item) => item.id),
    "confirmedFacts",
    issues
  );
  validateUniqueIds(
    data.suspectedCauses.map((item) => item.id),
    "suspectedCauses",
    issues
  );
  validateUniqueIds(
    data.recommendedActions.map((item) => item.id),
    "recommendedActions",
    issues
  );
  validateUniqueIds(
    data.additionalChecks.map((item) => item.id),
    "additionalChecks",
    issues
  );
  validateUniqueIds(
    data.reproductionSteps.map((item) => String(item.order)),
    "reproductionSteps.order",
    issues
  );

  const causeIds = new Set(data.suspectedCauses.map((item) => item.id));
  data.confirmedFacts.forEach((fact) => {
    validateEvidenceIds(fact.evidenceIds, evidenceIds, evidenceIssues);
    if (containsSpeculativeLanguage(fact.description)) {
      issues.push(
        `확인된 사실 ${fact.id}에 추측성 표현이 포함되어 있습니다.`
      );
    }
  });
  data.suspectedCauses.forEach((cause) => {
    validateEvidenceIds(cause.evidenceIds, evidenceIds, evidenceIssues);
    validateEvidenceIds(
      cause.counterEvidenceIds,
      evidenceIds,
      evidenceIssues
    );
  });
  data.relatedEvidence.forEach((reference) =>
    validateEvidenceIds(
      [reference.evidenceId],
      evidenceIds,
      evidenceIssues
    )
  );
  data.recommendedActions.forEach((action) =>
    validateCauseIds(action.relatedCauseIds, causeIds, issues)
  );
  data.additionalChecks.forEach((check) =>
    validateCauseIds(check.relatedCauseIds, causeIds, issues)
  );

  if (evidenceIssues.length > 0) {
    throw new AiFailureAnalysisSchemaError(
      "AI_ANALYSIS_EVIDENCE_INVALID",
      [...new Set(evidenceIssues)]
    );
  }
  if (issues.length > 0) {
    throw new AiFailureAnalysisSchemaError(
      "AI_ANALYSIS_INVALID_RESPONSE",
      issues
    );
  }

  return {
    ...data,
    reproductionSteps: [...data.reproductionSteps]
      .sort((left, right) => left.order - right.order)
      .map((step, index) => ({
        order: index + 1,
        description: step.description,
        ...(step.sourceStepId === null
          ? {}
          : { sourceStepId: step.sourceStepId }),
        isFailurePoint: step.isFailurePoint
      })),
    recommendedActions: [...data.recommendedActions].sort(
      (left, right) =>
        priorityRank(left.priority) - priorityRank(right.priority)
    )
  };
}

function validateUniqueIds(
  ids: string[],
  path: string,
  issues: string[]
): void {
  if (new Set(ids).size !== ids.length) {
    issues.push(`${path}: ID가 중복되었습니다.`);
  }
}

function validateEvidenceIds(
  ids: string[],
  allowed: ReadonlySet<string>,
  issues: string[]
): void {
  ids.forEach((id) => {
    if (!allowed.has(id)) {
      issues.push(`존재하지 않는 근거 ID입니다: ${id}`);
    }
  });
}

function validateCauseIds(
  ids: string[],
  allowed: ReadonlySet<string>,
  issues: string[]
): void {
  ids.forEach((id) => {
    if (!allowed.has(id)) {
      issues.push(`존재하지 않는 원인 ID입니다: ${id}`);
    }
  });
}

function containsSpeculativeLanguage(value: string): boolean {
  return /(가능성|추정|아마|일 수 있|것으로 보|것 같)/.test(value);
}

function priorityRank(value: string): number {
  return ["critical", "high", "medium", "low"].indexOf(value);
}
