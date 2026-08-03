import { describe, expect, it } from "vitest";
import {
  failureLimits,
  toProviderResponse,
  validAnalysisResult
} from "../failure-test-fixtures.js";
import {
  AiFailureAnalysisSchemaError,
  parseAiFailureAnalysisResponse
} from "./ai-failure-analysis-response.schema.js";

const evidenceIds = new Set(["network-1", "step-3-result"]);

describe("parseAiFailureAnalysisResponse", () => {
  it("유효한 응답을 검증하고 재현 순서와 조치 우선순위를 정렬한다", () => {
    const raw = toProviderResponse({
      ...validAnalysisResult,
      reproductionSteps: [...validAnalysisResult.reproductionSteps].reverse(),
      recommendedActions: [
        {
          id: "action-low",
          title: "로그 개선",
          description: "추가 로그를 남깁니다.",
          priority: "low",
          targetRole: "qa",
          relatedCauseIds: ["cause-1"]
        },
        ...validAnalysisResult.recommendedActions
      ]
    });
    const result = parseAiFailureAnalysisResponse(raw, evidenceIds, failureLimits);
    expect(result.reproductionSteps.map((step) => step.order)).toEqual([1, 2]);
    expect(result.recommendedActions[0]?.priority).toBe("high");
  });

  it("존재하지 않는 evidence ID를 차단한다", () => {
    const raw = toProviderResponse({
      ...validAnalysisResult,
      confirmedFacts: [
        { ...validAnalysisResult.confirmedFacts[0]!, evidenceIds: ["made-up"] }
      ]
    });
    expect(() =>
      parseAiFailureAnalysisResponse(raw, evidenceIds, failureLimits)
    ).toThrowError(AiFailureAnalysisSchemaError);
    try {
      parseAiFailureAnalysisResponse(raw, evidenceIds, failureLimits);
    } catch (error: unknown) {
      expect((error as AiFailureAnalysisSchemaError).code).toBe(
        "AI_ANALYSIS_EVIDENCE_INVALID"
      );
    }
  });

  it.each([
    ["허용하지 않는 카테고리", { category: "database_bug" }],
    ["범위를 벗어난 신뢰도", { confidence: 1.2 }]
  ])("%s를 차단한다", (_name, changes) => {
    const raw = toProviderResponse({
      ...validAnalysisResult,
      suspectedCauses: [
        { ...validAnalysisResult.suspectedCauses[0]!, ...changes } as never
      ]
    });
    expect(() =>
      parseAiFailureAnalysisResponse(raw, evidenceIds, failureLimits)
    ).toThrowError(AiFailureAnalysisSchemaError);
  });

  it("존재하지 않는 원인과 권장 조치의 관계를 차단한다", () => {
    const raw = toProviderResponse({
      ...validAnalysisResult,
      recommendedActions: [
        {
          ...validAnalysisResult.recommendedActions[0]!,
          relatedCauseIds: ["unknown-cause"]
        }
      ]
    });
    expect(() =>
      parseAiFailureAnalysisResponse(raw, evidenceIds, failureLimits)
    ).toThrowError(AiFailureAnalysisSchemaError);
  });

  it("확인된 사실의 과도한 추측 표현을 차단한다", () => {
    const raw = toProviderResponse({
      ...validAnalysisResult,
      confirmedFacts: [
        {
          ...validAnalysisResult.confirmedFacts[0]!,
          description: "백엔드 버그일 가능성이 있습니다."
        }
      ]
    });
    expect(() =>
      parseAiFailureAnalysisResponse(raw, evidenceIds, failureLimits)
    ).toThrowError(AiFailureAnalysisSchemaError);
  });
});
