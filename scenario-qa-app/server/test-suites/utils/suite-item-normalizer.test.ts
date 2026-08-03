import { describe, expect, it } from "vitest";
import { AppError } from "../../utils/api.js";
import {
  findDuplicateScenarioIds,
  normalizeSuiteItems
} from "./suite-item-normalizer.js";

describe("suite item normalizer", () => {
  it("입력 순서대로 정렬한 뒤 1부터 다시 번호를 매긴다", () => {
    const result = normalizeSuiteItems([
      { scenarioId: "b", order: 20, enabled: true, required: true },
      { scenarioId: "a", order: 10, enabled: true, required: false }
    ]);
    expect(result.map((item) => [item.scenarioId, item.order])).toEqual([
      ["a", 1],
      ["b", 2]
    ]);
  });

  it("중복되거나 잘못된 순서를 거부한다", () => {
    expect(() =>
      normalizeSuiteItems([
        { scenarioId: "a", order: 1, enabled: true, required: true },
        { scenarioId: "b", order: 1, enabled: true, required: true }
      ])
    ).toThrowError(AppError);
    expect(() =>
      normalizeSuiteItems([
        { scenarioId: "a", order: 0, enabled: true, required: true }
      ])
    ).toThrowError(/실행 순서/);
  });

  it("중복 시나리오 ID를 한 번만 반환한다", () => {
    expect(
      findDuplicateScenarioIds([
        { scenarioId: "a", order: 1, enabled: true, required: true },
        { scenarioId: "a", order: 2, enabled: true, required: true },
        { scenarioId: "a", order: 3, enabled: false, required: false }
      ])
    ).toEqual(["a"]);
  });
});
