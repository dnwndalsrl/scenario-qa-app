import path from "node:path";
import {
  parseTestScenario,
  resolveEnvironmentPlaceholders,
  runScenario,
  type ScenarioRunOutput
} from "scenario-test-runner";
import type { TestProject } from "../../shared/types/project.js";
import type { TestScenario, TestStep } from "../../shared/types/scenario.js";
import { getStorageRoot } from "../utils/file-storage.js";
import { assertSafeTestTargetUrl } from "../security/test-target-url-policy.js";

export async function executeScenarioWithPlaywright(
  project: TestProject,
  scenario: TestScenario
): Promise<ScenarioRunOutput> {
  const engineInput = {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description ?? "",
    startUrl: resolveStartUrl(project.baseUrl, scenario.startUrl),
    stopOnFailure: scenario.stopOnFailure,
    timeout: scenario.timeout,
    steps: scenario.steps.map(toEngineStep)
  };
  const environmentResolution = resolveEnvironmentPlaceholders(
    engineInput,
    process.env
  );
  const engineScenario = parseTestScenario(environmentResolution.value);

  return runScenario(engineScenario, {
    projectRoot: process.cwd(),
    artifactsDirectory: path.join(getStorageRoot(), "artifacts"),
    headless: true,
    browserLaunchArgs: process.env.PLAYWRIGHT_DISABLE_DEV_SHM_USAGE === "true"
      ? ["--disable-dev-shm-usage"]
      : [],
    sensitiveValues: environmentResolution.sensitiveValues,
    validateNavigationUrl: (value) => { assertSafeTestTargetUrl(value); }
  });
}

function toEngineStep(step: TestStep): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: step.id,
    order: step.order,
    name: step.name,
    action: step.action,
    timeout: step.timeout,
    required: step.required
  };
  if (step.target !== undefined) {
    base.target = step.target;
  }
  if (step.value !== undefined) {
    base.value = step.value;
  }
  if (step.sensitive !== undefined) {
    base.sensitive =
      step.sensitive || isSensitivePlaceholder(step.value);
  }
  if (step.expected !== undefined) {
    base.expected = {
      operator:
        step.expected.operator === "equals" ? "exact" : "contains",
      value: step.expected.value
    };
  }
  return base;
}

function resolveStartUrl(baseUrl: string, startUrl: string): string {
  let resolved: URL;
  try {
    resolved = new URL(startUrl, `${baseUrl.replace(/\/+$/, "")}/`);
  } catch {
    throw new Error("시나리오 시작 URL이 올바르지 않습니다.");
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    throw new Error("시나리오 시작 URL은 HTTP 또는 HTTPS여야 합니다.");
  }
  assertSafeTestTargetUrl(resolved.toString());
  return resolved.toString();
}

function isSensitivePlaceholder(value: string | undefined): boolean {
  return value !== undefined &&
    /\{\{[^}]*(?:PASSWORD|TOKEN|SECRET|AUTH|COOKIE)[^}]*\}\}/i.test(value);
}
