import type { AutomatedStepResult, AutomatedTestRun } from "../types/analysis";

const attentionStatuses = new Set(["failed", "error", "blocked"]);

function durationLabel(durationMs?: number): string | undefined {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) return undefined;
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  const seconds = durationMs / 1000;
  return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)}초`;
}

function actualLabel(step: AutomatedStepResult): string {
  if (step.actual?.trim()) return step.actual;
  if (step.status === "success") return "단계가 정상적으로 완료되었습니다.";
  if (step.status === "blocked") return step.errorMessage || "선행 단계 실패로 실행하지 않았습니다.";
  if (step.status === "pending") return "실행 대기 중입니다.";
  if (step.status === "running") return "현재 실행 중입니다.";
  return step.errorMessage || "예상 결과를 확인하지 못했습니다.";
}

export interface TestRunTimelineItem extends AutomatedStepResult {
  displayExpected?: string;
  displayActual: string;
  displayDuration?: string;
  needsAttention: boolean;
}

export interface TestRunTimeline {
  items: TestRunTimelineItem[];
  successCount: number;
  attentionCount: number;
  firstAttentionOrder?: number;
  displayDuration?: string;
}

export function buildTestRunTimeline(run: AutomatedTestRun): TestRunTimeline {
  const items = [...run.stepResults].sort((left, right) => left.order - right.order).map((step) => ({
    ...step,
    displayExpected: step.expected?.replace(/^url(?:-prefix)?:/, ""),
    displayActual: actualLabel(step),
    displayDuration: durationLabel(step.durationMs),
    needsAttention: attentionStatuses.has(step.status)
  }));
  const summedDuration = items.reduce((total, step) => total + (step.durationMs || 0), 0);
  const firstAttention = items.find((step) => step.needsAttention);

  return {
    items,
    successCount: items.filter((step) => step.status === "success").length,
    attentionCount: items.filter((step) => step.needsAttention).length,
    firstAttentionOrder: firstAttention?.order,
    displayDuration: durationLabel(run.durationMs ?? (summedDuration || undefined))
  };
}
