import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AutomatedTestRun, GeneratedTestScenario, QaDefect, QaDefectStatus } from "../../shared/types/analysis";

const statusSchema = z.enum(["new", "investigating", "in_progress", "revalidation_requested", "resolved", "deferred"]);
const severitySchema = z.enum(["low", "medium", "high", "critical"]);
const prioritySchema = z.enum(["P1", "P2", "P3", "P4"]);
const optionalText = (max: number) => z.string().trim().max(max);

export const qaDefectCreateSchema = z.object({
  runId: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(1000),
  severity: severitySchema, priority: prioritySchema, assignee: optionalText(100), note: optionalText(1000)
});
export const qaDefectUpdateSchema = z.object({
  status: statusSchema.optional(), severity: severitySchema.optional(), priority: prioritySchema.optional(), assignee: optionalText(100).optional(), note: optionalText(1000).optional()
}).refine((value) => Object.values(value).some((item) => item !== undefined && item !== ""), "변경할 내용을 입력해 주세요.");

export type QaDefectCreateInput = z.infer<typeof qaDefectCreateSchema>;
export type QaDefectUpdateInput = z.infer<typeof qaDefectUpdateSchema>;

const statusLabel: Record<QaDefectStatus, string> = { new: "신규", investigating: "확인 중", in_progress: "수정 중", revalidation_requested: "재검증 요청", resolved: "해결", deferred: "보류" };

export function buildQaDefect(id: string, run: AutomatedTestRun, scenario: GeneratedTestScenario, targetUrl: string, input: QaDefectCreateInput, author: string, now: string): QaDefect {
  const failedSteps = run.stepResults.filter((step) => ["failed", "error", "blocked"].includes(step.status));
  const failureSummary = run.error?.message || failedSteps.map((step) => step.errorMessage || `${step.description}: ${step.actual || "실패"}`).join(" / ") || "테스트 실행에 실패했습니다.";
  return {
    id, analysisId: run.analysisId, sourceRunId: run.id, scenarioId: scenario.id, scenarioTitle: scenario.title, targetUrl,
    title: input.title, description: input.description, status: "new", severity: input.severity, priority: input.priority, assignee: input.assignee,
    failureSummary, failedStepOrders: failedSteps.map((step) => step.order), screenshotArtifactIds: [...new Set([...run.screenshotArtifactIds, ...failedSteps.map((step) => step.screenshotArtifactId).filter(Boolean) as string[]])],
    notes: input.note ? [{ id: randomUUID(), text: input.note, author, createdAt: now }] : [],
    history: [{ id: randomUUID(), status: "new", description: "결함을 등록했습니다.", author, createdAt: now }], createdAt: now, updatedAt: now
  };
}

export function applyQaDefectUpdate(defect: QaDefect, input: QaDefectUpdateInput, author: string, now: string): QaDefect {
  const status = input.status || defect.status;
  const changes = [input.status && input.status !== defect.status ? `상태: ${statusLabel[input.status]}` : "", input.severity && input.severity !== defect.severity ? `심각도: ${input.severity}` : "", input.priority && input.priority !== defect.priority ? `우선순위: ${input.priority}` : "", input.assignee !== undefined && input.assignee !== defect.assignee ? `담당자: ${input.assignee || "미지정"}` : ""].filter(Boolean);
  return {
    ...defect, status, severity: input.severity || defect.severity, priority: input.priority || defect.priority, assignee: input.assignee ?? defect.assignee,
    notes: input.note ? [...defect.notes, { id: randomUUID(), text: input.note, author, createdAt: now }] : defect.notes,
    history: changes.length ? [...defect.history, { id: randomUUID(), status, description: changes.join(" · "), author, createdAt: now }] : defect.history,
    updatedAt: now
  };
}

export function rowToQaDefect(row: Record<string, any>): QaDefect {
  return { ...(row.payload as QaDefect), id: row.id, analysisId: row.analysis_id, title: row.title, severity: row.severity };
}
