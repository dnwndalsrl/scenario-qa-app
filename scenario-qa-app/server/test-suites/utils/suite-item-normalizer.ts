import type {
  TestSuiteItemInput
} from "../../../shared/types/test-suite.js";
import { AppError } from "../../utils/api.js";

export function normalizeSuiteItems(
  items: TestSuiteItemInput[]
): TestSuiteItemInput[] {
  const orders = new Set<number>();
  for (const item of items) {
    if (!Number.isInteger(item.order) || item.order < 1 || orders.has(item.order)) {
      throw new AppError(
        400,
        "TEST_SUITE_INVALID_ORDER",
        "실행 순서는 중복되지 않는 1 이상의 정수여야 합니다."
      );
    }
    orders.add(item.order);
  }
  return [...items]
    .sort((left, right) => left.order - right.order)
    .map((item, index) => ({ ...item, order: index + 1 }));
}

export function findDuplicateScenarioIds(
  items: TestSuiteItemInput[]
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.scenarioId)) {
      duplicates.add(item.scenarioId);
    }
    seen.add(item.scenarioId);
  }
  return [...duplicates];
}
