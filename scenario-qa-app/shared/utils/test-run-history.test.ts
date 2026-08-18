import { describe, expect, it } from "vitest";
import type { AutomatedTestRun } from "../types/analysis";
import { latestTestRuns, splitTestRunHistory } from "./test-run-history";

const run = (id: string, scenarioId: string, completedAt?: string) => ({ id, scenarioId, completedAt }) as AutomatedTestRun;

describe("test run history", () => {
  it("selects the latest timestamp even when records arrive out of order", () => {
    const runs = [run("latest", "scenario-1", "2026-08-18T02:00:00Z"), run("old", "scenario-1", "2026-08-18T01:00:00Z")];

    expect(latestTestRuns(runs).map((item) => item.id)).toEqual(["latest"]);
  });

  it("keeps one current result per scenario and preserves previous results", () => {
    const runs = [run("old", "scenario-1"), run("latest", "scenario-1"), run("only", "scenario-2")];

    expect(splitTestRunHistory(runs)).toEqual({ current: [runs[1], runs[2]], previous: [runs[0]] });
  });
});
