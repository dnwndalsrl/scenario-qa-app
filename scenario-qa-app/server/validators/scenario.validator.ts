import type {
  ScenarioInput,
  TestStep
} from "../../shared/types/scenario.js";
import { validateScenarioInput } from "../../shared/schemas/scenario.schema.js";
import { AppError } from "../utils/api.js";
import { createId } from "../utils/id.js";

export function parseScenarioInput(
  body: Record<string, unknown>
): ScenarioInput {
  const steps = Array.isArray(body.steps)
    ? body.steps.map((step, index) => parseStep(step, index))
    : [];
  const description =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim()
      : undefined;
  const input: ScenarioInput = {
    name: typeof body.name === "string" ? body.name.trim() : "",
    ...(description === undefined ? {} : { description }),
    startUrl: typeof body.startUrl === "string" ? body.startUrl.trim() : "",
    stopOnFailure:
      typeof body.stopOnFailure === "boolean" ? body.stopOnFailure : true,
    timeout:
      typeof body.timeout === "number" && Number.isFinite(body.timeout)
        ? body.timeout
        : 0,
    steps: normalizeStepOrder(steps)
  };
  const issues = validateScenarioInput(input);
  if (issues.length > 0) {
    throw new AppError(
      400,
      "SCENARIO_VALIDATION_ERROR",
      issues[0]?.message ?? "시나리오 입력값을 확인해 주세요.",
      { issues }
    );
  }
  return input;
}

export function normalizeStepOrder(steps: TestStep[]): TestStep[] {
  return steps.map((step, index) => ({
    ...step,
    order: index + 1
  }));
}

function parseStep(value: unknown, index: number): TestStep {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError(400, "INVALID_STEP", `${index + 1}단계 형식이 올바르지 않습니다.`);
  }
  const step = value as Record<string, unknown>;
  const action =
    typeof step.action === "string" ? step.action : "goto";
  const parsed: TestStep = {
    id:
      typeof step.id === "string" && step.id.trim().length > 0
        ? step.id
        : createId("step"),
    order: index + 1,
    name: typeof step.name === "string" ? step.name.trim() : "",
    action: action as TestStep["action"],
    timeout:
      typeof step.timeout === "number" && Number.isFinite(step.timeout)
        ? step.timeout
        : 0,
    required: typeof step.required === "boolean" ? step.required : true
  };
  if (typeof step.value === "string") {
    parsed.value = step.value;
  }
  if (typeof step.sensitive === "boolean") {
    parsed.sensitive = step.sensitive;
  }
  if (typeof step.target === "object" && step.target !== null) {
    const target = step.target as Record<string, unknown>;
    parsed.target = {
      strategy:
        typeof target.strategy === "string"
          ? (target.strategy as NonNullable<TestStep["target"]>["strategy"])
          : "testId",
      value: typeof target.value === "string" ? target.value : "",
      ...(typeof target.name === "string" && target.name.trim().length > 0
        ? { name: target.name.trim() }
        : {}),
      ...(typeof target.exact === "boolean" ? { exact: target.exact } : {})
    };
  }
  if (typeof step.expected === "object" && step.expected !== null) {
    const expected = step.expected as Record<string, unknown>;
    parsed.expected = {
      operator: expected.operator === "equals" ? "equals" : "contains",
      value: typeof expected.value === "string" ? expected.value : ""
    };
  }
  return parsed;
}
