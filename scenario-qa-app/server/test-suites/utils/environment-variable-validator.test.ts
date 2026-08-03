import { describe, expect, it } from "vitest";
import type { TestScenario } from "../../../shared/types/scenario.js";
import {
  collectEnvironmentReferences,
  findMissingEnvironmentVariables
} from "./environment-variable-validator.js";

function scenario(id: string, values: string[]): TestScenario {
  return {
    id,
    projectId: "project-1",
    name: id,
    startUrl: "/",
    stopOnFailure: true,
    timeout: 10000,
    steps: values.map((value, index) => ({
      id: `${id}-${index}`,
      order: index + 1,
      name: "입력",
      action: "fill",
      target: { strategy: "testId", value: "field" },
      value,
      timeout: 5000,
      required: true
    })),
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z"
  };
}

describe("environment variable validator", () => {
  it("같은 참조를 이름별로 중복 제거하고 시나리오 ID를 모은다", () => {
    const refs = collectEnvironmentReferences([
      scenario("a", ["{{LOGIN_ID}}", "{{LOGIN_ID}}"]),
      scenario("b", ["{{LOGIN_ID}}/{{LOGIN_PASSWORD}}"])
    ]);
    expect([...refs.get("LOGIN_ID") ?? []]).toEqual(["a", "b"]);
    expect([...refs.get("LOGIN_PASSWORD") ?? []]).toEqual(["b"]);
  });

  it("누락된 이름과 시나리오 ID만 반환하고 값은 노출하지 않는다", () => {
    const result = findMissingEnvironmentVariables(
      [scenario("a", ["{{LOGIN_ID}}/{{LOGIN_PASSWORD}}"])],
      { LOGIN_ID: "secret-id" }
    );
    expect(result).toEqual([
      { name: "LOGIN_PASSWORD", scenarioIds: ["a"] }
    ]);
    expect(JSON.stringify(result)).not.toContain("secret-id");
  });
});
