import { describe, expect, it } from "vitest";
import type { TestScenario } from "../../../shared/types/scenario.js";
import type { TestSuite } from "../../../shared/types/test-suite.js";
import { createSuiteRunSnapshot } from "./suite-snapshot.js";

describe("suite snapshot", () => {
  it("스위트와 시나리오를 깊은 복사해 이후 원본 변경을 차단한다", () => {
    const timestamp = "2026-08-03T00:00:00.000Z";
    const scenario: TestScenario = {
      id: "scenario-1",
      projectId: "project-1",
      name: "원본",
      startUrl: "/",
      stopOnFailure: true,
      timeout: 10000,
      steps: [{ id: "step-1", order: 1, name: "이동", action: "goto", value: "/", timeout: 5000, required: true }],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const suite: TestSuite = {
      id: "suite-1",
      projectId: "project-1",
      name: "스위트",
      status: "active",
      executionPolicy: "stop_on_failure",
      items: [{ id: "suite-item-1", suiteId: "suite-1", scenarioId: "scenario-1", order: 1, enabled: true, required: true, createdAt: timestamp, updatedAt: timestamp }],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const snapshot = createSuiteRunSnapshot(suite, [scenario], timestamp);
    scenario.name = "변경됨";
    scenario.steps[0]!.name = "변경 단계";
    suite.name = "변경 스위트";
    expect(snapshot.suiteName).toBe("스위트");
    expect(snapshot.items[0]?.scenarioSnapshot.name).toBe("원본");
    expect(snapshot.items[0]?.scenarioSnapshot.steps[0]?.name).toBe("이동");
  });
});
