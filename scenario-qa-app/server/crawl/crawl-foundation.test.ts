import { describe, expect, it } from "vitest";
import type { DiscoveredLink, GeneratedTestScenario } from "../../shared/types/analysis";
import { deduplicateTests, testFingerprint } from "../analysis/services/test-deduplication.service";
import { CrawlQueue } from "./crawl-queue";
import { monotonicProgress } from "./crawl-progress";
import { filterCrawlLink } from "./url-filter";
import { normalizeCrawlUrl } from "./url-normalizer";
import { isSameOrigin } from "./origin-policy";
import { normalizeUrlPattern } from "./url-pattern";

describe("crawl URL foundation", () => {
  it("상대 URL, fragment, tracking query, 정렬, trailing slash와 기본 포트를 정규화한다", () => {
    expect(normalizeCrawlUrl("../products/?utm_source=x&b=2&a=1#top", "https://EXAMPLE.com:443/app/start", true)).toBe("https://example.com/products?a=1&b=2");
    expect(normalizeCrawlUrl("/products/?page=2", "https://example.com", false)).toBe("https://example.com/products");
  });
  it("username/password URL을 차단하고 IDN은 URL 표준 표현을 사용한다", () => {
    expect(() => normalizeCrawlUrl("https://user:pass@example.com", "https://example.com", true)).toThrow();
    expect(normalizeCrawlUrl("https://한글.example/", "https://example.com", true)).toContain("xn--");
  });
  it("origin은 protocol, host, port가 모두 같은 경우에만 허용한다", () => {
    expect(isSameOrigin("https://example.com/a", "https://example.com/")).toBe(true); expect(isSameOrigin("http://example.com", "https://example.com")).toBe(false); expect(isSameOrigin("https://www.example.com", "https://example.com")).toBe(false); expect(isSameOrigin("https://example.com:444", "https://example.com")).toBe(false);
  });
  it.each([
    ["mailto:a@b.com", "mailto"], ["tel:123", "telephone"], ["javascript:void(0)", "blocked_protocol"], ["/file.pdf", "download_link"], ["/logout", "logout"], ["/account/delete", "dangerous_path"], ["https://other.example/a", "external_origin"]
  ])("%s 링크를 %s로 제외한다", (href, reason) => { expect(filterCrawlLink({ href, text: href }, "https://example.com/", "https://example.com/", { includeQueryUrls: false, respectNoFollow: true }).reason).toBe(reason); });
  it("nofollow 링크를 기본 제외한다", () => { expect(filterCrawlLink({ href: "/preview", noFollow: true }, "https://example.com/", "https://example.com/", { includeQueryUrls: false, respectNoFollow: true }).reason).toBe("nofollow"); });
});

describe("crawl queue and limits", () => {
  const item = (url: string, depth: number, score: number) => ({ url, normalizedUrl: url, depth, priority: { total: score, reasons: [] }, enqueuedAt: new Date(score).toISOString() });
  it("depth 우선 BFS 안에서 priority가 높은 URL을 먼저 꺼낸다", () => { const queue = new CrawlQueue(2, 5, 2); queue.enqueue(item("https://example.com/a", 1, 20)); queue.enqueue(item("https://example.com/b", 1, 90)); queue.enqueue(item("https://example.com/deep", 2, 100)); expect(queue.dequeue()?.normalizedUrl).toContain("/b"); expect(queue.dequeue()?.normalizedUrl).toContain("/a"); });
  it("중복, depth와 URL pattern 제한을 적용한다", () => { const queue = new CrawlQueue(1, 5, 2); expect(queue.enqueue(item("https://example.com/products/1", 1, 1))).toBe("queued"); expect(queue.enqueue(item("https://example.com/products/1", 1, 1))).toBe("duplicate"); expect(queue.enqueue(item("https://example.com/products/2", 1, 1))).toBe("queued"); expect(queue.enqueue(item("https://example.com/products/3", 1, 1))).toBe("pattern_limit"); expect(queue.enqueue(item("https://example.com/deep", 2, 1))).toBe("depth_limit"); expect(normalizeUrlPattern("https://example.com/products/99")).toBe("https://example.com/products/:id"); });
  it("진행률은 뒤로 감소하지 않는다", () => { expect(monotonicProgress(52, 15, 1, 10)).toBe(52); expect(monotonicProgress(15, 15, 5, 0)).toBe(35); });
});

describe("test deduplication", () => {
  const scenario = (id: string, pageId = "page-a", expected = "ok"): GeneratedTestScenario => ({ id, analysisId: "analysis-a", pageId, title: id, description: "same", purpose: "Title check", category: "visibility", safetyLevel: "safe", safetyReasons: [], confidence: .9, autoExecutable: true, sourceElementIds: ["element-1"], steps: [{ id: `step-${id}`, order: 1, action: "assert_text", description: "check", elementId: "element-1", expected, evidence: [] }], generatedAt: new Date().toISOString() });
  it("동일 페이지의 같은 action/element/expected만 제거한다", () => { const a = scenario("a"), b = scenario("b"), otherPage = scenario("c", "page-b"), otherExpected = scenario("d", "page-a", "different"); expect(testFingerprint(a)).toBe(testFingerprint(b)); const result = deduplicateTests([a, b, otherPage, otherExpected]); expect(result.tests).toHaveLength(3); expect(result.result.removedCount).toBe(1); });
});
