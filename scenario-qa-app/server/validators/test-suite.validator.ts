import type {
  SuiteExecutionPolicy,
  TestSuiteInput,
  TestSuiteItemInput,
  TestSuiteStatus
} from "../../shared/types/test-suite.js";
import { SUITE_EXECUTION_POLICIES } from "../../shared/types/test-suite.js";
import { AppError } from "../utils/api.js";

export function parseTestSuiteInput(body: Record<string, unknown>): TestSuiteInput {
  const status = body.status;
  const policy = body.executionPolicy;
  const description =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim()
      : undefined;
  const defaultTimeout = body.defaultTimeout;
  if (status !== "active" && status !== "inactive") {
    invalid("스위트 상태는 active 또는 inactive여야 합니다.");
  }
  if (
    typeof policy !== "string" ||
    !SUITE_EXECUTION_POLICIES.includes(policy as SuiteExecutionPolicy)
  ) {
    invalid("실행 정책을 확인해 주세요.");
  }
  if (!Array.isArray(body.items)) {
    invalid("시나리오 항목이 필요합니다.");
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length === 0 || name.length > 120) {
    invalid("스위트 이름은 1~120자로 입력해 주세요.");
  }
  if (
    defaultTimeout !== undefined &&
    (typeof defaultTimeout !== "number" ||
      !Number.isInteger(defaultTimeout) ||
      defaultTimeout < 1000 ||
      defaultTimeout > 1800000)
  ) {
    invalid("기본 timeout은 1,000~1,800,000ms 정수여야 합니다.");
  }
  const items = (body.items as unknown[]).map(parseItem);
  return {
    name,
    ...(description === undefined ? {} : { description }),
    status: status as TestSuiteStatus,
    executionPolicy: policy as SuiteExecutionPolicy,
    ...(typeof defaultTimeout === "number" ? { defaultTimeout } : {}),
    items
  };
}

function parseItem(value: unknown, index: number): TestSuiteItemInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${index + 1}번째 스위트 항목 형식이 올바르지 않습니다.`);
  }
  const item = value as Record<string, unknown>;
  if (
    typeof item.scenarioId !== "string" ||
    item.scenarioId.trim().length === 0 ||
    typeof item.order !== "number" ||
    typeof item.enabled !== "boolean" ||
    typeof item.required !== "boolean"
  ) {
    invalid(`${index + 1}번째 스위트 항목을 확인해 주세요.`);
  }
  return {
    scenarioId: (item.scenarioId as string).trim(),
    order: item.order as number,
    enabled: item.enabled as boolean,
    required: item.required as boolean
  };
}

function invalid(message: string): never {
  throw new AppError(400, "TEST_SUITE_VALIDATION_FAILED", message);
}
