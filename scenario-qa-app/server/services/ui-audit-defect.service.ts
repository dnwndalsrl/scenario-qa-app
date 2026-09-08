import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { QaDefect, QaDefectSeverity } from "../../shared/types/analysis";
import type { UiAuditIssue, UiAuditRule } from "../../shared/types/ui-audit";
import { UI_AUDIT_RULE_GUIDANCE } from "../../shared/utils/ui-audit-remediation";

export const uiAuditDefectCreateSchema = z.object({
  rule: z.enum(["horizontal_overflow", "clipped_content", "element_overlap", "small_target", "low_contrast"]),
  title: z.string().trim().min(1).max(160),
  severity: z.enum(["low", "medium", "high", "critical"]),
  note: z.string().trim().max(1000),
});

export function buildUiAuditDefect(input: z.infer<typeof uiAuditDefectCreateSchema>, audit: { id: string; targetUrl: string }, issues: UiAuditIssue[], author: string, now: string): QaDefect {
  const guidance = UI_AUDIT_RULE_GUIDANCE[input.rule as UiAuditRule];
  const states = new Set(issues.map((issue) => issue.state)).size;
  const elements = new Set(issues.map((issue) => issue.selector)).size;
  const priority = ({ critical: "P1", high: "P2", medium: "P3", low: "P4" } as const)[input.severity];
  const description = [`발생 이유: ${guidance.reason}`, `권장 수정: ${guidance.recommendation}`, `검증 기준: ${guidance.standard}`, `영향 요소: ${elements}개`, `확인 화면: ${states}개`, `UI QA 결과: /ui-audits/${audit.id}`].join("\n");
  return {
    id: randomUUID(), analysisId: "", sourceRunId: `ui-audit:${audit.id}:${input.rule}`, scenarioId: "", scenarioTitle: `UI QA · ${guidance.label}`, targetUrl: audit.targetUrl,
    title: input.title, description, status: "new", severity: input.severity as QaDefectSeverity, priority, assignee: "",
    failureSummary: `${issues.length}건의 UI 증거가 확인되었습니다.`, failedStepOrders: [], screenshotArtifactIds: [],
    notes: input.note ? [{ id: randomUUID(), text: input.note, author, createdAt: now }] : [],
    history: [{ id: randomUUID(), status: "new", description: "UI QA 개선 항목을 결함으로 등록했습니다.", author, createdAt: now }],
    createdAt: now, updatedAt: now, uiAuditId: audit.id, uiAuditRule: input.rule,
  };
}
