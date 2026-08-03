import type { AiFailureAnalysisResult } from "../../../shared/types/ai-failure-analysis.js";

export function normalizeFailureAnalysisResult(
  result: AiFailureAnalysisResult,
  inputLimitations: string[]
): AiFailureAnalysisResult {
  return {
    ...result,
    confirmedFacts: result.confirmedFacts.map((fact) => ({
      ...fact,
      evidenceIds: [...new Set(fact.evidenceIds)]
    })),
    suspectedCauses: [...result.suspectedCauses]
      .map((cause) => ({
        ...cause,
        confidence: roundConfidence(cause.confidence),
        evidenceIds: [...new Set(cause.evidenceIds)],
        counterEvidenceIds: [...new Set(cause.counterEvidenceIds)]
      }))
      .sort((left, right) => right.confidence - left.confidence),
    recommendedActions: result.recommendedActions.map((action) => ({
      ...action,
      relatedCauseIds: [...new Set(action.relatedCauseIds)]
    })),
    additionalChecks: result.additionalChecks.map((check) => ({
      ...check,
      relatedCauseIds: [...new Set(check.relatedCauseIds)]
    })),
    relatedEvidence: result.relatedEvidence.filter(
      (reference, index, values) =>
        values.findIndex(
          (candidate) => candidate.evidenceId === reference.evidenceId
        ) === index
    ),
    limitations: [...new Set([...inputLimitations, ...result.limitations])],
    overallConfidence: roundConfidence(result.overallConfidence)
  };
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}
