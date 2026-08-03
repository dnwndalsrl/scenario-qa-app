import {
  type ScenarioInput,
  type TestStep,
  type ValidationIssue
} from "../types/scenario.js";
import {
  LOCATOR_STRATEGIES,
  TEST_ACTIONS
} from "../../constants/test-action.js";

const MIN_TIMEOUT = 1000;
const MAX_TIMEOUT = 300000;

export function validateScenarioInput(
  input: ScenarioInput
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (input.name.trim().length === 0) {
    issues.push({ path: "name", message: "시나리오 이름을 입력해 주세요." });
  }
  if (input.startUrl.trim().length === 0) {
    issues.push({ path: "startUrl", message: "시작 경로 또는 URL을 입력해 주세요." });
  }
  if (input.timeout < MIN_TIMEOUT || input.timeout > MAX_TIMEOUT) {
    issues.push({
      path: "timeout",
      message: `timeout은 ${MIN_TIMEOUT}~${MAX_TIMEOUT}ms여야 합니다.`
    });
  }
  if (input.steps.length === 0) {
    issues.push({ path: "steps", message: "테스트 단계는 최소 1개가 필요합니다." });
  }
  const maxSteps = positiveInteger(process.env.MAX_STEPS_PER_SCENARIO, 50);
  if (input.steps.length > maxSteps) {
    issues.push({ path: "steps", message: `테스트 단계는 최대 ${maxSteps}개까지 등록할 수 있습니다.` });
  }
  input.steps.forEach((step, index) => {
    issues.push(...validateStep(step, index));
  });
  return issues;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function validateStep(step: TestStep, index: number): ValidationIssue[] {
  const path = `steps.${index}`;
  const issues: ValidationIssue[] = [];
  if (step.name.trim().length === 0) {
    issues.push({ path: `${path}.name`, message: `${index + 1}단계 이름을 입력해 주세요.` });
  }
  if (!TEST_ACTIONS.includes(step.action)) {
    issues.push({ path: `${path}.action`, message: "지원하지 않는 액션입니다." });
  }
  if (step.timeout < MIN_TIMEOUT || step.timeout > MAX_TIMEOUT) {
    issues.push({
      path: `${path}.timeout`,
      message: `${index + 1}단계 timeout 범위를 확인해 주세요.`
    });
  }

  if (step.action === "goto" || step.action === "fill") {
    if (step.value === undefined || step.value.trim().length === 0) {
      issues.push({ path: `${path}.value`, message: `${index + 1}단계 값을 입력해 주세요.` });
    }
  }
  if (["fill", "click", "assert_visible"].includes(step.action)) {
    if (
      step.target === undefined ||
      step.target.value.trim().length === 0 ||
      !LOCATOR_STRATEGIES.includes(step.target.strategy)
    ) {
      issues.push({ path: `${path}.target`, message: `${index + 1}단계 대상 요소를 입력해 주세요.` });
    }
  }
  if (step.action === "assert_url") {
    if (step.expected === undefined || step.expected.value.trim().length === 0) {
      issues.push({ path: `${path}.expected`, message: `${index + 1}단계 예상 URL을 입력해 주세요.` });
    }
  }
  return issues;
}
