import { describe, expect, it } from "vitest";
import { buildLocatorCandidates } from "./locator-builder";
import { sanitizeText, sanitizeUrl } from "../security/sensitive-data";

describe("DOM 정규화 유틸리티", () => {
  it("locator 후보를 test id, role, label, placeholder, text 순으로 만든다", () => {
    const values = buildLocatorCandidates({ tagName: "button", testId: "save", role: "button", accessibleName: "저장", label: "저장", placeholder: "입력", text: "저장" });
    expect(values.map((item) => item.strategy).slice(0, 5)).toEqual(["test_id", "role", "label", "placeholder", "text"]);
    expect(values.some((item) => item.value.includes("nth-child"))).toBe(false);
  });
  it("hash class는 CSS 후보에서 제외한다", () => expect(buildLocatorCandidates({ tagName: "div", classes: ["css-a83f91bc", "stable-card"] }).find((item) => item.strategy === "css")?.value).toBe("div.stable-card"));
  it("민감 query와 긴 텍스트를 정제한다", () => {
    expect(sanitizeUrl("https://example.com?a=1&token=secret")).toContain("token=%5BREDACTED%5D");
    expect(sanitizeText("password=secret " + "x".repeat(500), 40)).toHaveLength(40);
    expect(sanitizeText("password=secret", 100)).not.toContain("secret");
  });
});
