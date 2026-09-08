import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), body: { rule: "element_overlap", title: "메뉴 겹침", severity: "high", note: "담당 확인" }, status: vi.fn() }));
vi.mock("../../../services/supabase.service", () => ({ requireUser: mocks.requireUser }));
vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
vi.stubGlobal("getRouterParam", () => "audit-1");
vi.stubGlobal("readBody", async () => mocks.body);
vi.stubGlobal("setResponseStatus", mocks.status);
vi.stubGlobal("createError", (input: Record<string, unknown>) => Object.assign(new Error(String(input.statusMessage)), input));

function clientFor(options: { audit?: boolean; reviewStatus?: string; defectId?: string; issues?: boolean; race?: boolean } = {}) {
  const settings = { audit: true, reviewStatus: "fix_required", issues: true, ...options };
  const chain = (result: unknown) => ({ eq: () => chain(result), is: () => chain(result), select: () => chain(result), maybeSingle: async () => result });
  return { from: (table: string) => {
    if (table === "ui_audits") return { select: () => chain({ data: settings.audit ? { id: "audit-1", target_url: "https://example.com" } : null }) };
    if (table === "ui_audit_issues") return { select: () => ({ eq: () => ({ eq: async () => ({ data: settings.issues ? [{ id: "issue-1", rule: "element_overlap", severity: "high", title: "겹침", message: "가려짐", selector: "#menu", state: "initial", artifact_source_id: null, actual: {} }] : [] }) }) }) };
    return {
      select: () => chain({ data: { status: settings.reviewStatus, defect_id: settings.defectId || null } }),
      update: () => ({ eq: () => ({ eq: () => ({ is: () => ({ select: () => ({ maybeSingle: async () => ({ data: settings.race ? null : { defect_id: "created" }, error: null }) }) }) }) }) }),
    };
  }};
}

describe("POST UI audit defect", () => {
  beforeEach(() => { mocks.requireUser.mockReset(); mocks.status.mockClear(); });
  const handler = async () => (await import("./defects.post")).default as (event: unknown) => Promise<{ defect: { uiAuditId?: string; uiAuditRule?: string; description: string } }>;

  it("registers a fix-required group with source and guidance", async () => {
    mocks.requireUser.mockResolvedValue({ client: clientFor(), user: { id: "user-1", email: "qa@example.com" } });
    const result = await (await handler())({});
    expect(result.defect).toMatchObject({ uiAuditId: "audit-1", uiAuditRule: "element_overlap" });
    expect(result.defect.description).toContain("UI QA 결과: /ui-audits/audit-1");
    expect(mocks.status).toHaveBeenCalledWith({}, 201);
  });

  it("blocks duplicate registration", async () => {
    mocks.requireUser.mockResolvedValue({ client: clientFor({ defectId: "existing" }), user: { id: "user-1" } });
    await expect((await handler())({})).rejects.toMatchObject({ statusCode: 409 });
  });

  it.each(["unreviewed", "false_positive", "deferred"])("blocks %s groups", async (reviewStatus) => {
    mocks.requireUser.mockResolvedValue({ client: clientFor({ reviewStatus }), user: { id: "user-1" } });
    await expect((await handler())({})).rejects.toMatchObject({ statusCode: 409 });
  });

  it("returns 404 for a missing or non-owned audit", async () => {
    mocks.requireUser.mockResolvedValue({ client: clientFor({ audit: false }), user: { id: "user-1" } });
    await expect((await handler())({})).rejects.toMatchObject({ statusCode: 404 });
  });

  it("prevents a concurrent duplicate", async () => {
    mocks.requireUser.mockResolvedValue({ client: clientFor({ race: true }), user: { id: "user-1" } });
    await expect((await handler())({})).rejects.toMatchObject({ statusCode: 409 });
  });
});
