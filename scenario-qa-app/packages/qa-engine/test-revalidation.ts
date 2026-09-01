import type { AutomatedTestRun, TestFailureKind } from "../../shared/types/analysis";

const retryableKinds = new Set<TestFailureKind>(["automation_limit", "environment_error", "inconclusive"]);

export function shouldAutoRevalidate(run: AutomatedTestRun): boolean {
  return run.status === "error" && retryableKinds.has(run.failureKind as TestFailureKind);
}

function failureMessage(run: AutomatedTestRun): string | undefined {
  return run.error?.message || [...run.stepResults].reverse().find((step) => step.errorMessage)?.errorMessage;
}

export async function executeWithAutoRevalidation(execute: () => Promise<AutomatedTestRun>): Promise<AutomatedTestRun> {
  const first = await execute();
  return revalidateIfNeeded(first, execute);
}

export async function revalidateIfNeeded(first: AutomatedTestRun, executeAgain: () => Promise<AutomatedTestRun>): Promise<AutomatedTestRun> {
  if (!shouldAutoRevalidate(first)) return first;
  const second = await executeAgain();
  return {
    ...second,
    revalidation: {
      attemptedAt: new Date().toISOString(), originalStatus: first.status, originalFailureKind: first.failureKind,
      originalMessage: failureMessage(first), originalScreenshotArtifactIds: first.screenshotArtifactIds,
      finalStatus: second.status, recovered: second.status === "success"
    }
  };
}
