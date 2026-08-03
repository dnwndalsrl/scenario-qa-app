import type { TestScenario } from "../../../shared/types/scenario.js";
import type { MissingEnvironmentVariable } from "../../../shared/types/test-suite.js";

const ENVIRONMENT_REFERENCE = /\{\{([A-Z][A-Z0-9_]{0,63})\}\}/g;

export function collectEnvironmentReferences(
  scenarios: TestScenario[]
): Map<string, Set<string>> {
  const references = new Map<string, Set<string>>();
  for (const scenario of scenarios) {
    const serialized = JSON.stringify(scenario);
    for (const match of serialized.matchAll(ENVIRONMENT_REFERENCE)) {
      const name = match[1];
      if (name === undefined) {
        continue;
      }
      const scenarioIds = references.get(name) ?? new Set<string>();
      scenarioIds.add(scenario.id);
      references.set(name, scenarioIds);
    }
  }
  return references;
}

export function findMissingEnvironmentVariables(
  scenarios: TestScenario[],
  environment: NodeJS.ProcessEnv
): MissingEnvironmentVariable[] {
  return [...collectEnvironmentReferences(scenarios).entries()]
    .filter(([name]) => {
      const value = environment[name];
      return value === undefined || value.length === 0;
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, scenarioIds]) => ({
      name,
      scenarioIds: [...scenarioIds].sort()
    }));
}
