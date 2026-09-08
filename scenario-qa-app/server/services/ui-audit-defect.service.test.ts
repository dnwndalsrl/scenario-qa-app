import { describe, expect, it } from "vitest";
import type { UiAuditIssue } from "../../shared/types/ui-audit";
import { buildUiAuditDefect, uiAuditDefectCreateSchema } from "./ui-audit-defect.service";

const issues = [
  { id: "i1", rule: "element_overlap", severity: "high", title: "겹침", message: "가려짐", selector: "#menu", state: "initial", actual: {} },
  { id: "i2", rule: "element_overlap", severity: "medium", title: "겹침", message: "가려짐", selector: "#menu", state: "scroll_50", actual: {} },
] as UiAuditIssue[];

describe("UI audit defect service", () => {
  it("builds a traceable defect with remediation guidance", () => {
    const defect = buildUiAuditDefect({ rule: "element_overlap", title: "메뉴 겹침", severity: "high", note: "담당 확인" }, { id: "audit-1", targetUrl: "https://example.com" }, issues, "qa@example.com", "2026-09-07T00:00:00Z");
    expect(defect).toMatchObject({ title: "메뉴 겹침", severity: "high", priority: "P2", uiAuditId: "audit-1", uiAuditRule: "element_overlap", targetUrl: "https://example.com" });
    expect(defect.description).toContain("발생 이유:");
    expect(defect.description).toContain("권장 수정:");
    expect(defect.description).toContain("검증 기준:");
    expect(defect.description).toContain("영향 요소: 1개");
    expect(defect.description).toContain("확인 화면: 2개");
    expect(defect.notes[0]?.text).toBe("담당 확인");
  });

  it("validates title, severity and note", () => {
    expect(uiAuditDefectCreateSchema.safeParse({ rule: "element_overlap", title: "", severity: "high", note: "" }).success).toBe(false);
    expect(uiAuditDefectCreateSchema.safeParse({ rule: "element_overlap", title: "메뉴 겹침", severity: "high", note: "" }).success).toBe(true);
  });
});
