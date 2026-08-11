import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);

describe("analysis request scope", () => {
  it("always uses the current page only", async () => {
    const { FIXED_ANALYSIS_SCOPE } = await import("./index.post");

    expect(FIXED_ANALYSIS_SCOPE).toEqual({
      mode: "single_page",
      maxPages: 1,
      maxDepth: 0
    });
  });
});
