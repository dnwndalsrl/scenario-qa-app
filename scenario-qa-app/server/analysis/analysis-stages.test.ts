import { describe, expect, it } from "vitest";
import { ANALYSIS_STAGES } from "../../shared/types/analysis";

describe("single-page analysis stages", () => {
  it("defines every running stage with monotonic progress below completion", () => {
    const statuses = ["pending", "launching_browser", "loading_page", "collecting_page", "analyzing_page", "generating_tests", "running_tests", "completed"] as const;
    const stages = statuses.map((status) => ANALYSIS_STAGES.find((stage) => stage.status === status));

    expect(stages.every(Boolean)).toBe(true);
    expect(stages.map((stage) => stage!.progress)).toEqual([2, 5, 10, 20, 65, 75, 90, 100]);
    expect(stages.slice(0, -1).every((stage) => stage!.progress < 100)).toBe(true);
    expect(stages.slice(0, -1).every((stage) => !stage!.message.includes("수집하지 못했습니다"))).toBe(true);
  });
});
