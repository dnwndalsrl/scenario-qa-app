import { describe, expect, it } from "vitest";
import {
  normalizeConsoleLogs,
  normalizeNetworkErrors,
  sanitizeLogMessage
} from "./log-sanitizer.js";

describe("log sanitizer", () => {
  it("토큰, 비밀번호, 개인정보와 내부 경로를 마스킹한다", () => {
    const value = sanitizeLogMessage(
      "Authorization: Bearer abc.def.ghi password=hello user@example.com 010-1234-5678 C:\\app\\secret.ts",
      1000
    );
    expect(value).not.toContain("abc.def.ghi");
    expect(value).not.toContain("hello");
    expect(value).not.toContain("user@example.com");
    expect(value).not.toContain("010-1234-5678");
    expect(value).not.toContain("secret.ts");
  });

  it("콘솔 메시지 길이를 제한하고 반복을 병합한다", () => {
    const logs = [1, 2, 3].map((index) => ({
      type: "error",
      text: `same ${"x".repeat(100)}`,
      timestamp: `2026-08-03T00:00:0${index}.000Z`
    }));
    const result = normalizeConsoleLogs(logs, 10, 30);
    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(3);
    expect(result[0]?.message.length).toBeLessThanOrEqual(30);
  });

  it("네트워크 URL을 정제하고 동일 오류를 병합한다", () => {
    const errors = [1, 2].map((index) => ({
      url: "https://example.com/api?token=secret",
      method: "post",
      status: 500,
      failureText: "cookie=session-secret",
      resourceType: "fetch",
      timestamp: `2026-08-03T00:00:0${index}.000Z`
    }));
    const result = normalizeNetworkErrors(errors, 10, 100);
    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(2);
    expect(JSON.stringify(result)).not.toContain("session-secret");
    expect(JSON.stringify(result)).not.toContain("token=secret");
  });
});

