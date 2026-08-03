import { describe, expect, it } from "vitest";
import {
  baselineRunDetail,
  comparisonConfig,
  comparisonRunDetail,
  comparisonSteps
} from "../test-fixtures.js";
import type { RunComparisonInput } from "../types/test-run-comparison.js";
import { compareTestRuns } from "./test-run-comparator.js";

describe("test-run-comparator", () => {
  it("회귀, blocked 상태, 성능 저하와 HTTP 상태 변화를 함께 요약한다", () => {
    const result = compareTestRuns(input(), comparisonConfig);
    expect(result.runChangeType).toBe("regression");
    expect(result.stepComparisons?.[0]).toMatchObject({
      changeType: "regression",
      matchType: "step_id"
    });
    expect(result.stepComparisons?.[1]?.changeType).toBe("status_changed");
    expect(result.performanceComparison?.change).toBe("critical_degraded");
    expect(result.summary).toMatchObject({
      regressionCount: 1,
      degradedStepCount: 2,
      networkStatusChangeCount: 1,
      overallDurationChangeRate: 1
    });
  });

  it("단계 추가와 삭제를 구조 변경으로 표시한다", () => {
    const value = input();
    value.comparisonSteps = [
      value.comparisonSteps[0]!,
      {
        ...value.comparisonSteps[1]!,
        result: {
          ...value.comparisonSteps[1]!.result,
          stepId: "new-step",
          action: "goto",
          stepName: "추가 단계"
        },
        order: 3
      }
    ];
    const result = compareTestRuns(value, comparisonConfig);
    expect(result.runChangeType).toBe("structural_change");
    expect(result.summary).toMatchObject({ addedSteps: 1, removedSteps: 1 });
  });
});

function input(): RunComparisonInput {
  const baselineResult = baselineRunDetail.result!;
  const comparisonResult = comparisonRunDetail.result!;
  return {
    baselineRun: baselineRunDetail.run,
    comparisonRun: comparisonRunDetail.run,
    baselineResult,
    comparisonResult,
    baselineSteps: baselineResult.steps.map((result, index) => ({
      result,
      order: index + 1,
      definition: comparisonSteps[index]!
    })),
    comparisonSteps: comparisonResult.steps.map((result, index) => ({
      result,
      order: index + 1,
      definition: comparisonSteps[index]!
    }))
  };
}
