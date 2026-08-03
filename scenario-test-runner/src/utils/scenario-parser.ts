import { TestAction } from "../constants/test-action.js";
import {
  ARIA_ROLES,
  type AriaRole,
  type ElementTarget,
  type TestScenario,
  type TestStep,
  type UrlExpectation
} from "../types/scenario.js";
import { ScenarioValidationError } from "./errors.js";

export function parseTestScenario(input: unknown): TestScenario {
  const scenario = requireRecord(input, "시나리오");
  const stepsValue = scenario.steps;
  if (!Array.isArray(stepsValue) || stepsValue.length === 0) {
    throw new ScenarioValidationError(
      "시나리오 steps는 한 개 이상의 배열이어야 합니다."
    );
  }

  const steps = stepsValue.map((step, index) =>
    parseTestStep(step, `steps[${index}]`)
  );
  const orders = steps.map((step) => step.order);
  if (new Set(orders).size !== orders.length) {
    throw new ScenarioValidationError("단계 order 값은 중복될 수 없습니다.");
  }

  const timeout = requirePositiveNumber(scenario.timeout, "timeout");
  return {
    id: requireNonEmptyString(scenario.id, "id"),
    name: requireNonEmptyString(scenario.name, "name"),
    description: requireString(scenario.description, "description"),
    startUrl: requireNonEmptyString(scenario.startUrl, "startUrl"),
    stopOnFailure: requireBoolean(
      scenario.stopOnFailure,
      "stopOnFailure"
    ),
    timeout,
    steps
  };
}

function parseTestStep(input: unknown, fieldPath: string): TestStep {
  const step = requireRecord(input, fieldPath);
  const action = parseTestAction(step.action, `${fieldPath}.action`);
  const timeout =
    step.timeout === undefined
      ? undefined
      : requirePositiveNumber(step.timeout, `${fieldPath}.timeout`);
  const base = {
    id: requireNonEmptyString(step.id, `${fieldPath}.id`),
    order: requirePositiveInteger(step.order, `${fieldPath}.order`),
    name: requireNonEmptyString(step.name, `${fieldPath}.name`),
    required: requireBoolean(step.required, `${fieldPath}.required`),
    ...(timeout === undefined ? {} : { timeout })
  };

  switch (action) {
    case TestAction.GOTO:
      return {
        ...base,
        action,
        value: requireNonEmptyString(step.value, `${fieldPath}.value`)
      };

    case TestAction.FILL: {
      const sensitive =
        step.sensitive === undefined
          ? undefined
          : requireBoolean(step.sensitive, `${fieldPath}.sensitive`);
      return {
        ...base,
        action,
        target: parseElementTarget(step.target, `${fieldPath}.target`),
        value: requireString(step.value, `${fieldPath}.value`),
        ...(sensitive === undefined ? {} : { sensitive })
      };
    }

    case TestAction.CLICK:
      return {
        ...base,
        action,
        target: parseElementTarget(step.target, `${fieldPath}.target`)
      };

    case TestAction.ASSERT_URL:
      return {
        ...base,
        action,
        expected: parseUrlExpectation(
          step.expected,
          `${fieldPath}.expected`
        )
      };

    case TestAction.ASSERT_VISIBLE:
      return {
        ...base,
        action,
        target: parseElementTarget(step.target, `${fieldPath}.target`)
      };
  }
}

function parseElementTarget(input: unknown, fieldPath: string): ElementTarget {
  const target = requireRecord(input, fieldPath);
  const strategy = requireNonEmptyString(
    target.strategy,
    `${fieldPath}.strategy`
  );
  const value = requireNonEmptyString(target.value, `${fieldPath}.value`);
  const exact =
    target.exact === undefined
      ? undefined
      : requireBoolean(target.exact, `${fieldPath}.exact`);
  const base = {
    value,
    ...(exact === undefined ? {} : { exact })
  };

  switch (strategy) {
    case "testId":
    case "label":
    case "placeholder":
    case "text":
    case "css":
      return { ...base, strategy };

    case "role": {
      if (!isAriaRole(value)) {
        throw new ScenarioValidationError(
          `${fieldPath}.value에 지원하지 않는 ARIA role이 있습니다: ${value}`
        );
      }
      const name =
        target.name === undefined
          ? undefined
          : requireNonEmptyString(target.name, `${fieldPath}.name`);
      return {
        ...base,
        strategy,
        value,
        ...(name === undefined ? {} : { name })
      };
    }

    default:
      throw new ScenarioValidationError(
        `${fieldPath}.strategy가 지원되지 않습니다: ${strategy}`
      );
  }
}

function parseUrlExpectation(
  input: unknown,
  fieldPath: string
): UrlExpectation {
  const expected = requireRecord(input, fieldPath);
  const operator = requireNonEmptyString(
    expected.operator,
    `${fieldPath}.operator`
  );
  if (operator !== "exact" && operator !== "contains") {
    throw new ScenarioValidationError(
      `${fieldPath}.operator는 exact 또는 contains여야 합니다.`
    );
  }
  return {
    operator,
    value: requireNonEmptyString(expected.value, `${fieldPath}.value`)
  };
}

function parseTestAction(input: unknown, fieldPath: string): TestAction {
  const value = requireNonEmptyString(input, fieldPath);
  if (!Object.values(TestAction).includes(value as TestAction)) {
    throw new ScenarioValidationError(
      `${fieldPath}가 지원되지 않습니다: ${value}`
    );
  }
  return value as TestAction;
}

function isAriaRole(value: string): value is AriaRole {
  return (ARIA_ROLES as readonly string[]).includes(value);
}

function requireRecord(
  input: unknown,
  fieldPath: string
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ScenarioValidationError(`${fieldPath}는 객체여야 합니다.`);
  }
  return input as Record<string, unknown>;
}

function requireString(input: unknown, fieldPath: string): string {
  if (typeof input !== "string") {
    throw new ScenarioValidationError(`${fieldPath}는 문자열이어야 합니다.`);
  }
  return input;
}

function requireNonEmptyString(input: unknown, fieldPath: string): string {
  const value = requireString(input, fieldPath);
  if (value.trim().length === 0) {
    throw new ScenarioValidationError(`${fieldPath}는 비어 있을 수 없습니다.`);
  }
  return value;
}

function requireBoolean(input: unknown, fieldPath: string): boolean {
  if (typeof input !== "boolean") {
    throw new ScenarioValidationError(`${fieldPath}는 boolean이어야 합니다.`);
  }
  return input;
}

function requirePositiveNumber(input: unknown, fieldPath: string): number {
  if (
    typeof input !== "number" ||
    !Number.isFinite(input) ||
    input <= 0
  ) {
    throw new ScenarioValidationError(`${fieldPath}는 양수여야 합니다.`);
  }
  return input;
}

function requirePositiveInteger(input: unknown, fieldPath: string): number {
  const value = requirePositiveNumber(input, fieldPath);
  if (!Number.isInteger(value)) {
    throw new ScenarioValidationError(`${fieldPath}는 정수여야 합니다.`);
  }
  return value;
}
