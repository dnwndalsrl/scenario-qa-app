import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), body: { rule: "element_overlap", status: "unreviewed", note: "" } }));
vi.mock("../../../services/supabase.service", () => ({ requireUser: mocks.requireUser }));
vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
vi.stubGlobal("getRouterParam", () => "audit-1");
vi.stubGlobal("readBody", async () => mocks.body);
vi.stubGlobal("createError", (input: Record<string, unknown>) => Object.assign(new Error(String(input.statusMessage)), input));

const clientFor = (auditExists = true) => ({
  from: (table: string) => table === "ui_audits"
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: auditExists ? { id: "audit-1" } : null }) }) }) }
    : { upsert: (payload: Record<string, unknown>) => ({ select: () => ({ single: async () => ({ data: { ...payload, updated_at: "2026-09-07T00:00:00Z" }, error: null }) }) }) },
});

describe("PUT UI audit review", () => {
  beforeEach(() => {
    mocks.body = { rule: "element_overlap", status: "unreviewed", note: "" };
    mocks.requireUser.mockReset();
  });

  it.each(["unreviewed", "fix_required", "false_positive", "deferred"])("stores %s with a note", async (status) => {
    mocks.body = { rule: "element_overlap", status, note: "  확인 메모  " };
    mocks.requireUser.mockResolvedValue({ client: clientFor(), user: { id: "user-1" } });
    const handler = (await import("./reviews.put")).default as (event: unknown) => Promise<{ review: { status: string; note: string } }>;
    await expect(handler({})).resolves.toMatchObject({ review: { status, note: "확인 메모" } });
  });

  it("rejects an unauthenticated request", async () => {
    mocks.requireUser.mockRejectedValue(new Error("AUTH_REQUIRED"));
    const handler = (await import("./reviews.put")).default as (event: unknown) => Promise<unknown>;
    await expect(handler({})).rejects.toThrow("AUTH_REQUIRED");
  });

  it("returns 404 when the audit is not owned or missing", async () => {
    mocks.requireUser.mockResolvedValue({ client: clientFor(false), user: { id: "user-1" } });
    const handler = (await import("./reviews.put")).default as (event: unknown) => Promise<unknown>;
    await expect(handler({})).rejects.toMatchObject({ statusCode: 404 });
  });
});
