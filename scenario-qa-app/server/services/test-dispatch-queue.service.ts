import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomatedTestRun, TestDispatchState, TestDispatchStatus } from "../../shared/types/analysis";
import { dispatchTestWorkflow, type GitHubDispatchConfig } from "./github-actions.service";

const maxAttempts = 3;
const retryDelaysMs = [60_000, 5 * 60_000];
const staleDispatchMs = 12 * 60 * 60 * 1000;

export interface TestDispatchRow {
  id: string; analysis_id: string; test_id: string; payload: AutomatedTestRun;
}

export function initialDispatchState(now = new Date().toISOString()): TestDispatchState {
  return { status: "queued", attemptCount: 0, nextAttemptAt: now };
}

export function dispatchFailure(current: TestDispatchState, now: Date, message: string): { dispatch: TestDispatchState; exhausted: boolean } {
  const exhausted = current.attemptCount >= maxAttempts;
  if (exhausted) return { exhausted, dispatch: { ...current, status: "exhausted", nextAttemptAt: undefined, lastError: message } };
  const delay = retryDelaysMs[Math.max(0, current.attemptCount - 1)] || retryDelaysMs.at(-1)!;
  return {
    exhausted,
    dispatch: { ...current, status: "retrying", nextAttemptAt: new Date(now.getTime() + delay).toISOString(), lastError: message }
  };
}

export function isDispatchDue(run: AutomatedTestRun, now = new Date()): boolean {
  if (!run.dispatch || !["queued", "retrying"].includes(run.dispatch.status)) return false;
  const due = Date.parse(run.dispatch.nextAttemptAt || run.queuedAt || "");
  return !Number.isFinite(due) || due <= now.getTime();
}

export function isDispatchedRunStale(run: AutomatedTestRun, now = new Date()): boolean {
  if (run.status !== "pending" || run.dispatch?.status !== "dispatched") return false;
  const dispatched = Date.parse(run.dispatch.dispatchedAt || run.dispatch.lastAttemptAt || run.queuedAt || "");
  return Number.isFinite(dispatched) && now.getTime() - dispatched >= staleDispatchMs;
}

async function saveRun(client: SupabaseClient, rowId: string, run: AutomatedTestRun) {
  const { error } = await client.from("test_runs").update({ status: run.status, payload: run }).eq("id", rowId);
  if (error) throw error;
}

export async function attemptTestRunDispatch(client: SupabaseClient, row: TestDispatchRow, config: GitHubDispatchConfig, now = new Date(), fetcher: typeof fetch = fetch): Promise<TestDispatchStatus> {
  const run = row.payload;
  if (!isDispatchDue(run, now)) return run.dispatch?.status || "exhausted";
  const dispatch: TestDispatchState = {
    ...run.dispatch!, status: "dispatching", attemptCount: run.dispatch!.attemptCount + 1,
    lastAttemptAt: now.toISOString(), nextAttemptAt: undefined, lastError: undefined
  };
  await saveRun(client, row.id, { ...run, dispatch });

  try {
    await dispatchTestWorkflow(row.analysis_id, row.test_id, row.id, config, fetcher);
    const completed: TestDispatchState = { ...dispatch, status: "dispatched", dispatchedAt: now.toISOString() };
    await saveRun(client, row.id, { ...run, dispatch: completed });
    return completed.status;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "GitHub Actions 전송에 실패했습니다.";
    const failure = dispatchFailure(dispatch, now, message);
    const failedRun: AutomatedTestRun = failure.exhausted
      ? { ...run, status: "error", completedAt: now.toISOString(), dispatch: failure.dispatch, error: { code: "WORKFLOW_DISPATCH_EXHAUSTED", message: "GitHub Actions 실행 요청이 반복해서 실패했습니다." } }
      : { ...run, dispatch: failure.dispatch };
    await saveRun(client, row.id, failedRun);
    return failure.dispatch.status;
  }
}

export async function expireStaleDispatchedRun(client: SupabaseClient, row: TestDispatchRow, now = new Date()): Promise<boolean> {
  if (!isDispatchedRunStale(row.payload, now)) return false;
  await saveRun(client, row.id, {
    ...row.payload, status: "error", completedAt: now.toISOString(),
    error: { code: "WORKFLOW_START_TIMEOUT", message: "GitHub Actions 실행이 제한 시간 안에 시작되지 않았습니다." }
  });
  return true;
}
