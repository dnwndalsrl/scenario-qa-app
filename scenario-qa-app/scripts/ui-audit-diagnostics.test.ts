import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), launch: vi.fn(), collect: vi.fn(), compare: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("playwright", () => ({ chromium: { launch: mocks.launch } }));
vi.mock("../server/playwright/ui-audit-collector", () => ({ collectUiAuditPage: mocks.collect }));
vi.mock("../server/playwright/ui-design-comparison", () => ({ compareUiDesign: mocks.compare }));

import { createUiAuditDiagnostic, formatUiAuditDiagnostic, runUiAudit, UiAuditExecutionError } from "../packages/ui-audit/index";

const auditId = "706c9e31-6804-4275-95d0-48cf8fb72aa2";

function setup(failure?: "upload" | "metadata" | "issues" | "completion" | "failure-save") {
  const updates: Record<string, unknown>[] = [];
  const browser = { newPage: vi.fn(async () => ({})), close: vi.fn(async () => undefined) };
  const client = {
    from: vi.fn((table: string) => {
      if (table === "ui_audits") return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { id: auditId, user_id: "user-1", status: "queued", normalized_url: "https://private.example/token", viewport_width: 1440, viewport_height: 900, has_reference: false }, error: null }) }) }),
        update: (payload: Record<string, unknown>) => ({ eq: async () => {
          updates.push(payload);
          const status = payload.status;
          return { error: failure === "completion" && status === "completed" ? { code: "DB_DONE", message: "https://secret.example" } : failure === "failure-save" && status === "failed" ? { code: "DB_FAIL" } : null };
        } })
      };
      return { insert: async () => ({ error: table === "ui_audit_artifacts" && failure === "metadata" ? { code: "DB_META", message: "<none>" } : table === "ui_audit_issues" && failure === "issues" ? new Error("token=secret") : null }) };
    }),
    storage: { from: () => ({ upload: async () => ({ error: failure === "upload" ? { code: "STORAGE_DOWN", message: undefined, url: "https://secret.example" } : null }) }) }
  };
  mocks.createClient.mockReturnValue(client);
  mocks.launch.mockResolvedValue(browser);
  mocks.collect.mockResolvedValue({ artifacts: [{ sourceId: "initial", state: "initial", width: 1440, height: 900, bytes: Buffer.from("image") }], issues: [{ rule: "contrast", severity: "high", title: "title", message: "message", selector: "#x", state: "initial", artifactSourceId: "initial", actual: {} }] });
  return { updates, browser };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
});

describe("UI audit diagnostics", () => {
  it.each([
    ["upload", "artifact_upload", "STORAGE_DOWN"],
    ["metadata", "artifact_metadata", "DB_META"],
    ["issues", "issue_storage", "UI_AUDIT_ISSUE_STORAGE_FAILED"],
    ["completion", "completion_update", "DB_DONE"]
  ] as const)("records the %s failure stage", async (failure, stage, errorCode) => {
    const { updates } = setup(failure);
    await expect(runUiAudit(auditId)).rejects.toMatchObject({ diagnostic: { auditId, stage, code: errorCode } });
    const failed = updates.find((item) => item.status === "failed");
    expect(failed?.error).toMatchObject({ code: "UI_AUDIT_RUNNER_FAILED", auditId, stage, errorCode });
    expect(JSON.stringify(failed)).not.toMatch(/secret|private\.example|<none>/);
  });

  it("normalizes Error, object, empty, and sensitive messages", () => {
    expect(createUiAuditDiagnostic(auditId, "page_collection", new Error("token=secret"))).toMatchObject({ code: "UI_AUDIT_PAGE_COLLECTION_FAILED", type: "Error" });
    expect(createUiAuditDiagnostic(auditId, "artifact_upload", { code: "STORAGE_DOWN", message: "<none>" })).toMatchObject({ code: "STORAGE_DOWN", type: "UnknownError", message: "화면 이미지 업로드 단계에서 실패했습니다." });
    expect(formatUiAuditDiagnostic(undefined, auditId)).not.toMatch(/undefined|<none>|secret|token=/);
  });

  it("preserves the original diagnostic when failure persistence and browser close fail", async () => {
    const { browser } = setup("failure-save");
    mocks.collect.mockRejectedValue({ code: "COLLECT_FAILED", message: "https://secret.example" });
    browser.close.mockRejectedValue(new Error("close secret"));
    const result = runUiAudit(auditId);
    await expect(result).rejects.toBeInstanceOf(UiAuditExecutionError);
    await expect(result).rejects.toMatchObject({ diagnostic: { stage: "page_collection", code: "COLLECT_FAILED" } });
  });

  it("keeps the existing successful completion behavior", async () => {
    const { updates, browser } = setup();
    await expect(runUiAudit(auditId)).resolves.toBeUndefined();
    expect(updates.some((item) => item.status === "completed" && item.error === null)).toBe(true);
    expect(browser.close).toHaveBeenCalledOnce();
  });
});
