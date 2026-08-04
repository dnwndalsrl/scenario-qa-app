import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../../shared/errors";
import { assertRedirectAllowed, isBlockedAddress, normalizeUrl, validateTargetUrl } from "./url-validator";

describe("URL 검증과 SSRF 방어", () => {
  beforeEach(() => { process.env.ALLOW_LOCAL_TEST_TARGETS = "true"; process.env.ALLOWED_LOCAL_TEST_PORTS = "3000,3011"; });
  it("HTTP/HTTPS URL을 정규화한다", () => {
    expect(normalizeUrl("HTTPS://Example.COM:443/path#section")).toBe("https://example.com/path");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com/");
  });
  it.each(["not-a-url", "file:///etc/passwd", "javascript:alert(1)"])("잘못되거나 비 HTTP URL을 차단한다: %s", (value) => expect(() => normalizeUrl(value)).toThrow(AppError));
  it("사용자 정보가 포함된 URL을 차단한다", () => expect(() => normalizeUrl("https://user:secret@example.com")).toThrow(/사용자 이름/));
  it("명시된 개발 포트의 localhost만 허용한다", async () => {
    await expect(validateTargetUrl("http://localhost:3000")).resolves.toBe("http://localhost:3000/");
    await expect(validateTargetUrl("http://localhost:9999")).rejects.toMatchObject({ code: "ANALYSIS_SSRF_BLOCKED" });
  });
  it("운영 정책에서는 localhost를 차단한다", async () => { process.env.ALLOW_LOCAL_TEST_TARGETS = "false"; await expect(validateTargetUrl("http://127.0.0.1:3000")).rejects.toMatchObject({ code: "ANALYSIS_SSRF_BLOCKED" }); });
  it.each(["10.0.0.1", "172.16.0.1", "192.168.1.1", "127.0.0.1", "169.254.169.254", "::1", "fd00::1"])("보호된 IP를 식별한다: %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));
  it("리다이렉트 대상 내부 IP를 별도 오류로 차단한다", async () => { process.env.ALLOW_LOCAL_TEST_TARGETS = "false"; await expect(assertRedirectAllowed("http://169.254.169.254/latest/meta-data")).rejects.toMatchObject({ code: "ANALYSIS_REDIRECT_BLOCKED" }); });
});
