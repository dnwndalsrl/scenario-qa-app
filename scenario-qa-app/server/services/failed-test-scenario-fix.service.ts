import type { AutomatedTestRun } from "../../shared/types/analysis";
import { AppError } from "../../shared/errors";

const failedStatuses = new Set(["failed", "error", "blocked"]);
const shorten = (value?: string) => value?.slice(0, 500);

export function buildFailureFixContext(run: AutomatedTestRun) {
  if (!failedStatuses.has(run.status)) {
    throw new AppError("FAILED_RUN_REQUIRED", "실패한 최근 실행이 있어야 수정안을 만들 수 있습니다.", 409);
  }
  return {
    status: run.status,
    failureKind: run.failureKind,
    scenarioRevision: run.scenarioRevision || 1,
    error: run.error ? { code: run.error.code, message: shorten(run.error.message), detail: shorten(run.error.detail) } : undefined,
    failedSteps: run.stepResults.filter((step) => failedStatuses.has(step.status)).map((step) => ({
      order: step.order, action: step.action, description: shorten(step.description), expected: shorten(step.expected), actual: shorten(step.actual),
      errorMessage: shorten(step.errorMessage), failureKind: step.failureKind
    })),
    consoleIssues: run.consoleIssues.slice(0, 5).map((issue) => ({ type: issue.type, text: shorten(issue.text) })),
    networkIssues: run.networkIssues.slice(0, 5).map((issue) => ({ url: shorten(issue.url), method: issue.method, status: issue.status, failureText: shorten(issue.failureText) })),
    screenshotArtifactIds: run.screenshotArtifactIds.slice(0, 5)
  };
}

export type FailureFixContext = ReturnType<typeof buildFailureFixContext>;
