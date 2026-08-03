import { describe, expect, it } from "vitest";
import type { TestSuiteRunItem } from "../../../shared/types/test-suite.js";
import {
  aggregateSuiteRunItems,
  determineSuiteRunStatus
} from "./suite-run-aggregator.js";

function item(status: TestSuiteRunItem["status"], order: number): TestSuiteRunItem {
  return {
    id: `item-${order}`,
    suiteRunId: "run-1",
    suiteItemId: `suite-item-${order}`,
    scenarioId: `scenario-${order}`,
    scenarioName: `시나리오 ${order}`,
    order,
    status,
    required: true,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z"
  };
}

describe("suite run aggregator", () => {
  it("disabled skipped 항목을 실행 대상과 완료 수에서 제외한다", () => {
    const aggregate = aggregateSuiteRunItems(
      [item("success", 1), item("skipped", 2)],
      1
    );
    expect(aggregate.completedItems).toBe(1);
    expect(aggregate.skippedCount).toBe(1);
    expect(aggregate.progressRate).toBe(100);
    expect(determineSuiteRunStatus(aggregate, 1)).toBe("success");
  });

  it("성공과 실패 또는 중단이 섞이면 partial_success다", () => {
    const aggregate = aggregateSuiteRunItems(
      [item("success", 1), item("failed", 2), item("blocked", 3)],
      3
    );
    expect(aggregate.progressRate).toBe(100);
    expect(determineSuiteRunStatus(aggregate, 3)).toBe("partial_success");
  });

  it("성공 없이 실패하면 failed, 실행 대상이 없으면 blocked다", () => {
    const failed = aggregateSuiteRunItems([item("error", 1)], 1);
    expect(determineSuiteRunStatus(failed, 1)).toBe("failed");
    expect(determineSuiteRunStatus(aggregateSuiteRunItems([], 0), 0)).toBe("blocked");
  });
});
