import { describe, expect, it } from "vitest";
import { detectSensitiveData } from "./sensitive-data-detector.js";

describe("detectSensitiveData", () => {
  it.each([
    ["password: qa-password-123", "password"],
    ["비밀번호는 P@ssw0rd123", "password"],
    ["Authorization: Bearer abcdefghijklmnop", "authorization"],
    ["access token = abcdefghijklmnop", "token"],
    ["API key: sk-example-secret-value", "api_key"],
    ["주민번호 900101-1234567", "resident_number"],
    ["인증번호는 123456", "verification_code"]
  ])("위험 값 %s을 감지한다", (text, category) => {
    expect(detectSensitiveData(text)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category })
      ])
    );
  });

  it("허용된 환경변수 이름과 참조는 민감 값으로 보지 않는다", () => {
    const text =
      "비밀번호 입력창에 TEST_LOGIN_PASSWORD 값을 입력하고 {{TEST_LOGIN_PASSWORD}}를 사용한다.";
    expect(
      detectSensitiveData(text, ["TEST_LOGIN_PASSWORD"])
    ).toEqual([]);
  });

  it("잘못된 비밀번호라는 테스트 설명은 실제 값으로 보지 않는다", () => {
    expect(
      detectSensitiveData(
        "비밀번호에 잘못된 비밀번호를 입력한다."
      )
    ).toEqual([]);
  });
});
