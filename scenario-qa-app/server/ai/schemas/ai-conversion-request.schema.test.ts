import { describe, expect, it } from "vitest";
import { AppError } from "../../utils/api.js";
import { createConversionInput } from "../test-fixtures.js";
import { parseAiConversionRequest } from "./ai-conversion-request.schema.js";

describe("parseAiConversionRequest", () => {
  it("입력 길이 제한을 적용한다", () => {
    const input = {
      ...createConversionInput(),
      naturalLanguage: "가".repeat(101)
    };
    try {
      parseAiConversionRequest(input, 100);
      throw new Error("길이 제한이 적용되지 않았습니다.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("AI_INPUT_TOO_LONG");
    }
  });

  it("환경변수 이름을 정규화한다", () => {
    const input = {
      ...createConversionInput(),
      availableEnvironmentVariables: [
        " test_login_id ",
        "TEST_LOGIN_ID"
      ]
    };
    expect(
      parseAiConversionRequest(input, 10000)
        .availableEnvironmentVariables
    ).toEqual(["TEST_LOGIN_ID"]);
  });
});
