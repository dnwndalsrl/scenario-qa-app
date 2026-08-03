import { describe, expect, it } from "vitest";
import {
  createConversionInput,
  createProviderResponse
} from "../test-fixtures.js";
import { AiResponseSchemaError } from "../schemas/ai-scenario-response.schema.js";
import { normalizeAiConversionResponse } from "./conversion-normalizer.js";

describe("normalizeAiConversionResponse", () => {
  it("단계를 순서대로 정렬하고 실행기 호환 초안으로 변환한다", () => {
    const result = normalizeAiConversionResponse(
      createProviderResponse(),
      createConversionInput()
    );
    expect(result.scenarioDraft.steps.map((step) => step.temporaryId)).toEqual(
      ["draft-1", "draft-2", "draft-3", "draft-4"]
    );
    expect(result.scenarioDraft.steps.map((step) => step.order)).toEqual([
      1, 2, 3, 4
    ]);
    expect(result.scenarioDraft.steps[1]).toMatchObject({
      action: "fill",
      value: "{{TEST_LOGIN_ID}}",
      reviewRequired: true
    });
  });

  it("지원하지 않는 단계를 실행 steps에서 분리한다", () => {
    const response = createProviderResponse();
    response.scenario.steps.push({
      temporaryId: "draft-sms",
      order: 5,
      name: "문자 인증",
      originalText: "문자로 전송된 인증번호를 입력한다.",
      action: "unsupported",
      target: null,
      value: null,
      expected: null,
      timeout: null,
      required: true,
      confidence: 0.99,
      reviewRequired: true,
      reviewReason: "문자 인증은 지원하지 않습니다."
    });
    response.unsupportedSteps.push({
      temporaryId: "draft-sms",
      order: 5,
      originalText: "문자로 전송된 인증번호를 입력한다.",
      reason: "문자 인증은 지원하지 않습니다.",
      suggestion: "테스트 환경에서 인증을 우회하세요."
    });
    const result = normalizeAiConversionResponse(
      response,
      createConversionInput()
    );
    expect(
      result.scenarioDraft.steps.some(
        (step) => step.temporaryId === "draft-sms"
      )
    ).toBe(false);
    expect(result.unsupportedSteps).toHaveLength(1);
  });

  it("누락 필드를 별도 정보로 생성하고 검토 대상으로 표시한다", () => {
    const response = createProviderResponse();
    const fill = response.scenario.steps[0]!;
    fill.target = null;
    fill.value = null;
    fill.reviewRequired = false;
    const result = normalizeAiConversionResponse(
      response,
      createConversionInput()
    );
    expect(result.missingInformation.map((item) => item.type)).toEqual(
      expect.arrayContaining(["missing_target", "missing_value"])
    );
    expect(
      result.scenarioDraft.steps.find(
        (step) => step.temporaryId === fill.temporaryId
      )?.reviewRequired
    ).toBe(true);
  });

  it("사용자가 제공하지 않은 CSS selector를 거절한다", () => {
    const response = createProviderResponse();
    response.scenario.steps[0]!.target = {
      strategy: "css",
      value: ".invented > button",
      name: null,
      exact: null
    };
    expect(() =>
      normalizeAiConversionResponse(response, createConversionInput())
    ).toThrow(AiResponseSchemaError);
  });
});
