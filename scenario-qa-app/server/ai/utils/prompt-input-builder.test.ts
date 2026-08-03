import { describe, expect, it } from "vitest";
import {
  extractEnvironmentReferences,
  findInvalidEnvironmentVariableNames,
  normalizeEnvironmentVariableNames
} from "./prompt-input-builder.js";

describe("환경변수 이름 처리", () => {
  it("대문자로 정규화하고 중복을 제거한다", () => {
    expect(
      normalizeEnvironmentVariableNames([
        " test_login_id ",
        "TEST_LOGIN_ID",
        "test_password"
      ])
    ).toEqual(["TEST_LOGIN_ID", "TEST_PASSWORD"]);
  });

  it("허용되지 않는 이름을 식별한다", () => {
    expect(
      findInvalidEnvironmentVariableNames([
        "VALID_NAME",
        "INVALID-NAME",
        "1INVALID"
      ])
    ).toEqual(["INVALID-NAME", "1INVALID"]);
  });

  it("문자열에서 환경변수 참조를 추출한다", () => {
    expect(
      extractEnvironmentReferences(
        "{{TEST_LOGIN_ID}} / {{TEST_LOGIN_PASSWORD}}"
      )
    ).toEqual(["TEST_LOGIN_ID", "TEST_LOGIN_PASSWORD"]);
  });
});
