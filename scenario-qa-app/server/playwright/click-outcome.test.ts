import { describe, expect, it } from "vitest";
import type { DiscoveredElement, GeneratedTestStep } from "../../shared/types/analysis";
import { inferClickOutcome, urlMatchesExpected } from "./click-outcome";

const step = (expected?: string): GeneratedTestStep => ({ id: "step-1", order: 1, action: "click", description: "클릭", expected, evidence: [] });
const link = (href: string): DiscoveredElement => ({ id: "element-1", type: "link", tagName: "a", href, visible: true, locatorCandidates: [], safetyHints: [] });

describe("click outcome inference", () => {
  it("다른 문서 링크는 URL 이동을 검증한다", () => {
    expect(inferClickOutcome(step(), link("/about/"), "https://example.com/")).toEqual({ kind: "url", expectedUrl: "https://example.com/about/", allowDescendant: true });
  });

  it("같은 문서의 해시 링크는 대상 섹션 노출을 검증한다", () => {
    expect(inferClickOutcome(step(), link("/#about%20us"), "https://example.com/")).toEqual({ kind: "scroll", targetId: "about us" });
  });

  it("결과를 추론할 수 없는 같은 문서 클릭은 기존 동작을 유지한다", () => {
    expect(inferClickOutcome(step(), link("/"), "https://example.com/")).toEqual({ kind: "none" });
  });

  it("사용자가 지정한 스크롤 기대값을 우선한다", () => {
    expect(inferClickOutcome(step("scroll:#performance"), link("/other"), "https://example.com/")).toEqual({ kind: "scroll", targetId: "performance" });
  });

  it("명시적 URL은 정확히, 자동 링크 목적지는 하위 리디렉션까지 검증한다", () => {
    expect(inferClickOutcome(step("url:/product/"), link("/ignored"), "https://example.com/")).toMatchObject({ kind: "url", allowDescendant: false });
    expect(inferClickOutcome(step("url-prefix:/product/"), link("/ignored"), "https://example.com/")).toMatchObject({ kind: "url", allowDescendant: true });
  });
});

describe("URL outcome matching", () => {
  it("후행 슬래시는 동일한 경로로 처리한다", () => {
    expect(urlMatchesExpected("https://example.com/about", "https://example.com/about/")).toBe(true);
  });

  it("기대 URL에 해시가 있으면 해시까지 검증한다", () => {
    expect(urlMatchesExpected("https://example.com/#other", "https://example.com/#about")).toBe(false);
  });

  it("자동 링크 검증은 같은 경로의 하위 리디렉션만 허용한다", () => {
    expect(urlMatchesExpected("https://example.com/product/introduction/", "https://example.com/product/", true)).toBe(true);
    expect(urlMatchesExpected("https://example.com/product-other/", "https://example.com/product/", true)).toBe(false);
  });
});
