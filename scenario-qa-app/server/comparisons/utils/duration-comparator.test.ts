import { describe, expect, it } from "vitest";
import { comparisonConfig } from "../test-fixtures.js";
import { compareDuration } from "./duration-comparator.js";

describe("duration-comparator", () => {
  it("차이와 변화율을 계산하고 심각한 저하를 판정한다", () => {
    expect(compareDuration(3000, 6000, comparisonConfig)).toMatchObject({
      differenceMs: 3000,
      changeRate: 1,
      change: "critical_degraded"
    });
  });

  it("작은 차이는 변화율이 커도 안정으로 처리한다", () => {
    expect(compareDuration(10, 20, comparisonConfig).change).toBe("stable");
  });

  it("기준 시간이 0이면 변화율을 만들지 않는다", () => {
    const result = compareDuration(0, 1000, comparisonConfig);
    expect(result.changeRate).toBeUndefined();
    expect(result.change).toBe("stable");
  });

  it("실행 시간이 감소하면 개선으로 처리한다", () => {
    expect(compareDuration(3000, 2000, comparisonConfig).change).toBe("improved");
  });
});
