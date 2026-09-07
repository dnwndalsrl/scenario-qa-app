import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), build: vi.fn(async () => Buffer.from("xlsx")), headers: vi.fn() }));
vi.mock("../../../services/supabase.service", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../services/ui-audit-workbook.service", () => ({ buildUiAuditWorkbook: mocks.build, uiAuditWorkbookFileName: () => "ui-qa-report-test-20260907.xlsx" }));
vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
vi.stubGlobal("getRouterParam", () => "audit-1");
vi.stubGlobal("setResponseHeader", mocks.headers);
vi.stubGlobal("createError", (input: Record<string, unknown>) => Object.assign(new Error(String(input.statusMessage)), input));

function clientFor(audit: Record<string, unknown> | null) {
  return {
    from: (table: string) => table === "ui_audits"
      ? { select: () => ({ eq: () => ({ single: async () => ({ data: audit, error: audit ? null : { message: "missing" } }) }) }) }
      : { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://signed.example/image.png" } }) }) },
  };
}

const auditRow = { id: "audit-1", name: "test", target_url: "https://example.com", normalized_url: "https://example.com/", status: "completed", current_message: "완료", viewport_preset: "desktop", has_reference: false, created_at: "2026-09-07T00:00:00Z", completed_at: "2026-09-07T00:01:00Z", error: null, summary: { issueCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, screenshotCount: 0 } };

describe("GET UI audit Excel export", () => {
  beforeEach(() => { mocks.requireUser.mockReset(); mocks.build.mockClear(); mocks.headers.mockClear(); });

  it("returns an XLSX for a completed owned audit", async () => {
    mocks.requireUser.mockResolvedValue({ client: clientFor(auditRow), user: { id: "user-1" } });
    const handler = (await import("./export.get")).default as (event: unknown) => Promise<Buffer>;
    await expect(handler({})).resolves.toEqual(Buffer.from("xlsx"));
    expect(mocks.build).toHaveBeenCalledOnce();
    expect(mocks.headers).toHaveBeenCalledWith({}, "Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  it("rejects an unauthenticated request", async () => {
    mocks.requireUser.mockRejectedValue(new Error("AUTH_REQUIRED"));
    const handler = (await import("./export.get")).default as (event: unknown) => Promise<unknown>;
    await expect(handler({})).rejects.toThrow("AUTH_REQUIRED");
  });

  it("returns 404 for a missing or non-owned audit", async () => {
    mocks.requireUser.mockResolvedValue({ client: clientFor(null), user: { id: "user-1" } });
    const handler = (await import("./export.get")).default as (event: unknown) => Promise<unknown>;
    await expect(handler({})).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects an unfinished audit", async () => {
    mocks.requireUser.mockResolvedValue({ client: clientFor({ ...auditRow, status: "running" }), user: { id: "user-1" } });
    const handler = (await import("./export.get")).default as (event: unknown) => Promise<unknown>;
    await expect(handler({})).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.build).not.toHaveBeenCalled();
  });
});
