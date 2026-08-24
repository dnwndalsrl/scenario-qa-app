import { describe, expect, it } from "vitest";
import type { AutomatedTestRun } from "../../shared/types/analysis";
import { attemptTestRunDispatch, dispatchFailure, initialDispatchState, isDispatchDue, isDispatchedRunStale } from "./test-dispatch-queue.service";

function run(overrides: Partial<AutomatedTestRun> = {}): AutomatedTestRun {
  return {
    id: "run-1", analysisId: "analysis-1", scenarioId: "test-1", status: "pending",
    stepResults: [], consoleIssues: [], networkIssues: [], screenshotArtifactIds: [],
    queuedAt: "2026-08-24T00:00:00.000Z", dispatch: initialDispatchState("2026-08-24T00:00:00.000Z"),
    ...overrides
  };
}

describe("test dispatch queue policy", () => {
  it("creates a durable queued state that is immediately due", () => {
    const state = initialDispatchState("2026-08-24T00:00:00.000Z");
    expect(state).toEqual({ status: "queued", attemptCount: 0, nextAttemptAt: "2026-08-24T00:00:00.000Z" });
    expect(isDispatchDue(run(), new Date("2026-08-24T00:00:00.000Z"))).toBe(true);
  });

  it("backs off after a temporary dispatch failure", () => {
    const outcome = dispatchFailure({ status: "dispatching", attemptCount: 1, lastAttemptAt: "2026-08-24T00:00:00.000Z" }, new Date("2026-08-24T00:00:00.000Z"), "temporary");
    expect(outcome.exhausted).toBe(false);
    expect(outcome.dispatch).toMatchObject({ status: "retrying", attemptCount: 1, nextAttemptAt: "2026-08-24T00:01:00.000Z", lastError: "temporary" });
  });

  it("exhausts the job after the third failed attempt", () => {
    const outcome = dispatchFailure({ status: "dispatching", attemptCount: 3, lastAttemptAt: "2026-08-24T00:00:00.000Z" }, new Date("2026-08-24T00:00:00.000Z"), "permanent");
    expect(outcome.exhausted).toBe(true);
    expect(outcome.dispatch).toMatchObject({ status: "exhausted", attemptCount: 3, lastError: "permanent" });
  });

  it("only retries due queued states and expires dispatched jobs after twelve hours", () => {
    const retrying = run({ dispatch: { status: "retrying", attemptCount: 1, nextAttemptAt: "2026-08-24T00:05:00.000Z" } });
    expect(isDispatchDue(retrying, new Date("2026-08-24T00:04:59.000Z"))).toBe(false);
    expect(isDispatchDue(retrying, new Date("2026-08-24T00:05:00.000Z"))).toBe(true);
    const dispatched = run({ dispatch: { status: "dispatched", attemptCount: 1, dispatchedAt: "2026-08-24T00:00:00.000Z" } });
    expect(isDispatchedRunStale(dispatched, new Date("2026-08-24T11:59:59.000Z"))).toBe(false);
    expect(isDispatchedRunStale(dispatched, new Date("2026-08-24T12:00:00.000Z"))).toBe(true);
  });

  it("persists dispatching and dispatched states around a successful request", async () => {
    const updates: Array<Record<string, any>> = [];
    const client = { from: () => ({ update: (value: Record<string, any>) => ({ eq: async () => { updates.push(value); return { error: null }; } }) }) } as any;
    const row = {
      id: "33333333-3333-4333-8333-333333333333", analysis_id: "11111111-1111-4111-8111-111111111111",
      test_id: "22222222-2222-4222-8222-222222222222", payload: run()
    };
    const config = { token: "token", owner: "owner", repo: "repo", workflowId: "workflow.yml", ref: "main" };
    const status = await attemptTestRunDispatch(client, row, config, new Date("2026-08-24T00:00:00.000Z"), async () => new Response(null, { status: 204 }));
    expect(status).toBe("dispatched");
    expect(updates.map((item) => item.payload.dispatch.status)).toEqual(["dispatching", "dispatched"]);
  });

  it("keeps a failed request pending for automatic retry", async () => {
    const updates: Array<Record<string, any>> = [];
    const client = { from: () => ({ update: (value: Record<string, any>) => ({ eq: async () => { updates.push(value); return { error: null }; } }) }) } as any;
    const row = {
      id: "33333333-3333-4333-8333-333333333333", analysis_id: "11111111-1111-4111-8111-111111111111",
      test_id: "22222222-2222-4222-8222-222222222222", payload: run()
    };
    const config = { token: "token", owner: "owner", repo: "repo", workflowId: "workflow.yml", ref: "main" };
    const status = await attemptTestRunDispatch(client, row, config, new Date("2026-08-24T00:00:00.000Z"), async () => new Response(null, { status: 503 }));
    expect(status).toBe("retrying");
    expect(updates.at(-1)).toMatchObject({ status: "pending", payload: { dispatch: { status: "retrying", attemptCount: 1 } } });
  });
});
