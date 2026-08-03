import { describe, expect, it, vi } from "vitest";
import { AnalyticsCache, stableCacheKey } from "./analytics-cache.js";
describe("analytics cache", () => {
  it("reuses cloned values until TTL expires", async () => { let now = 0; const loader = vi.fn(async () => ({ count: 1 })); const cache = new AnalyticsCache(60, () => now); const first = await cache.getOrSet("key", loader); first.count = 9; expect((await cache.getOrSet("key", loader)).count).toBe(1); expect(loader).toHaveBeenCalledTimes(1); now = 61; await cache.getOrSet("key", loader); expect(loader).toHaveBeenCalledTimes(2); });
  it("generates deterministic keys regardless of property insertion order", () => { expect(stableCacheKey({ b: 2, a: 1 })).toBe(stableCacheKey({ a: 1, b: 2 })); });
});
