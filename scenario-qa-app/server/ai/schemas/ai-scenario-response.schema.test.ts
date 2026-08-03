import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { createProviderResponse } from "../test-fixtures.js";
import {
  AiResponseSchemaError,
  AiScenarioStructuredOutputSchema,
  parseAiScenarioProviderResponse
} from "./ai-scenario-response.schema.js";

describe("AI 응답 스키마", () => {
  it("정상 구조화 응답을 검증한다", () => {
    expect(
      parseAiScenarioProviderResponse(createProviderResponse(), 50)
    ).toBeTruthy();
  });

  it("설치된 OpenAI SDK가 Zod 4 스키마를 object JSON Schema로 변환한다", () => {
    const format = zodTextFormat(
      AiScenarioStructuredOutputSchema,
      "scenario_conversion"
    );
    expect(format).toMatchObject({
      type: "json_schema",
      name: "scenario_conversion",
      strict: true,
      schema: { type: "object" }
    });
  });

  it("허용하지 않는 액션을 차단한다", () => {
    const value = createProviderResponse() as unknown as {
      scenario: { steps: Array<{ action: string }> };
    };
    value.scenario.steps[0]!.action = "upload";
    expect(AiScenarioStructuredOutputSchema.safeParse(value).success).toBe(
      false
    );
  });

  it("허용하지 않는 target strategy를 차단한다", () => {
    const value = createProviderResponse() as unknown as {
      scenario: {
        steps: Array<{ target: { strategy: string } | null }>;
      };
    };
    value.scenario.steps[0]!.target!.strategy = "xpath";
    expect(AiScenarioStructuredOutputSchema.safeParse(value).success).toBe(
      false
    );
  });

  it("confidence 범위를 검증한다", () => {
    const value = createProviderResponse();
    value.scenario.steps[0]!.confidence = 1.1;
    expect(() =>
      parseAiScenarioProviderResponse(value, 50)
    ).toThrow(AiResponseSchemaError);
  });

  it("최대 단계 수를 검증한다", () => {
    const value = createProviderResponse();
    value.scenario.steps = Array.from({ length: 4 }, (_item, index) => ({
      ...value.scenario.steps[0]!,
      temporaryId: `many-${index}`,
      order: index + 1
    }));
    expect(() =>
      parseAiScenarioProviderResponse(value, 3)
    ).toThrow(AiResponseSchemaError);
  });
});
