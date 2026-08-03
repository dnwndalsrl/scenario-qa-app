import { describe, expect, it } from "vitest";
import { normalizeDynamicString, stableStringify } from "./actual-value-normalizer.js";
import { compareUrls } from "./url-comparator.js";

describe("comparison normalizers", () => {
  it("actual의 key 순서와 동적 값을 정규화한다", () => {
    expect(
      stableStringify({
        b: 2,
        runId: "run-123456789",
        a: "2026-08-03T00:00:00.000Z"
      })
    ).toBe(
      stableStringify({
        a: "2026-08-04T01:00:00.000Z",
        runId: "run-987654321",
        b: 2
      })
    );
    expect(normalizeDynamicString("session-1234567890")).toBe("[DYNAMIC_ID]");
  });

  it("URL query 순서 차이를 무시하고 민감값을 마스킹한다", () => {
    const result = compareUrls(
      "https://example.com/path/?b=2&token=secret&a=1",
      "https://example.com/path?a=1&token=other&b=2"
    );
    expect(result.changed).toBe(false);
    expect(result.baselineUrl).toContain("%5BREDACTED%5D");
    expect(result.baselineUrl).not.toContain("secret");
  });

  it("origin과 pathname 변화는 변경으로 표시한다", () => {
    expect(
      compareUrls("http://example.com/a", "https://example.com/b")
    ).toMatchObject({ changed: true, originChanged: true, pathnameChanged: true });
  });
});
