import type { TestScenario } from "../../../shared/types/scenario.js";
import type {
  TestSuite,
  TestSuiteRunSnapshot
} from "../../../shared/types/test-suite.js";

export function createSuiteRunSnapshot(
  suite: TestSuite,
  scenarios: TestScenario[],
  createdAt: string
): TestSuiteRunSnapshot {
  const scenariosById = new Map(
    scenarios.map((scenario) => [scenario.id, scenario])
  );
  const items = [...suite.items]
    .sort((left, right) => left.order - right.order)
    .map((item) => {
      const scenario = scenariosById.get(item.scenarioId);
      if (scenario === undefined) {
        throw new Error(`snapshot scenario missing: ${item.scenarioId}`);
      }
      return {
        suiteItemId: item.id,
        scenarioId: item.scenarioId,
        scenarioName: scenario.name,
        order: item.order,
        enabled: item.enabled,
        required: item.required,
        scenarioSnapshot: structuredClone(scenario)
      };
    });
  return structuredClone({
    suiteName: suite.name,
    ...(suite.description === undefined
      ? {}
      : { suiteDescription: suite.description }),
    executionPolicy: suite.executionPolicy,
    ...(suite.defaultTimeout === undefined
      ? {}
      : { defaultTimeout: suite.defaultTimeout }),
    items,
    createdAt
  });
}
