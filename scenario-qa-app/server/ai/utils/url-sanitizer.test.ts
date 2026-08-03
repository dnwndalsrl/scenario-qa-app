import { describe, expect, it } from "vitest";
import { sanitizeOrigin, sanitizeUrl } from "./url-sanitizer.js";

describe("sanitizeUrl", () => {
  it("민감한 query 값과 hash를 제거한다", () => {
    const result = sanitizeUrl(
      "https://user:pass@example.com/callback?code=abc&state=test&access_token=token#secret"
    );
    expect(result).toContain("code=%5BREDACTED%5D");
    expect(result).toContain("access_token=%5BREDACTED%5D");
    expect(result).toContain("state=test");
    expect(result).not.toContain("user:pass");
    expect(result).not.toContain("abc");
    expect(result).not.toContain("#secret");
  });

  it("상대 URL도 경로를 유지해 정제한다", () => {
    expect(sanitizeUrl("/api/login?password=pw&mode=test")).toBe(
      "/api/login?password=%5BREDACTED%5D&mode=test"
    );
  });

  it("프로젝트 URL에서는 origin만 남긴다", () => {
    expect(sanitizeOrigin("https://qa.example.com/path?token=x")).toBe(
      "https://qa.example.com"
    );
  });
});

