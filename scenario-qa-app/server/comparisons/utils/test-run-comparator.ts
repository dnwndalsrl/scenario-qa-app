import type {
  TestRunComparison,
  TestRunComparisonSummary
} from "../../../shared/types/test-run-comparison.js";
import type {
  ComparisonConfig,
  RunComparisonInput
} from "../types/test-run-comparison.js";
import { compareConsoleErrors } from "./console-fingerprint.js";
import { createComparisonSummary } from "./comparison-summary.js";
import {
  compareDuration,
  toPerformanceComparison
} from "./duration-comparator.js";
import { compareNetworkErrors } from "./network-fingerprint.js";
import { compareRunStatus } from "./run-status-comparator.js";
import { compareStepMatch } from "./step-comparator.js";
import { matchSteps } from "./step-matcher.js";

export type CompletedComparisonFields = Pick<
  TestRunComparison,
  | "baselineRunStatus"
  | "comparisonRunStatus"
  | "baselineCreatedAt"
  | "comparisonCreatedAt"
  | "runChangeType"
  | "summary"
  | "stepComparisons"
  | "consoleComparisons"
  | "networkComparisons"
  | "networkStatusChanges"
  | "performanceComparison"
  | "limitations"
>;

export function compareTestRuns(
  input: RunComparisonInput,
  config: ComparisonConfig
): CompletedComparisonFields {
  const matches = matchSteps(
    input.baselineSteps,
    input.comparisonSteps,
    config.stepMatchMinConfidence
  );
  const stepComparisons = matches.map((match, index) =>
    compareStepMatch(match, index, config)
  );
  const hasStructuralChange = stepComparisons.some(
    (step) => step.changeType === "added" || step.changeType === "removed"
  );
  const consoleComparisons = compareConsoleErrors(
    input.baselineResult.consoleLogs,
    input.comparisonResult.consoleLogs,
    input.baselineResult.steps,
    input.comparisonResult.steps,
    config.maxConsoleItems
  );
  const network = compareNetworkErrors(
    input.baselineResult.networkErrors,
    input.comparisonResult.networkErrors,
    config.maxNetworkItems
  );
  const performanceComparison = toPerformanceComparison(
    compareDuration(
      input.baselineResult.durationMs,
      input.comparisonResult.durationMs,
      config
    ),
    config
  );
  const summary: TestRunComparisonSummary = createComparisonSummary({
    totalBaselineSteps: input.baselineSteps.length,
    totalComparisonSteps: input.comparisonSteps.length,
    steps: stepComparisons,
    console: consoleComparisons,
    network: network.comparisons,
    performance: performanceComparison
  });
  const limitations = [
    ...(hasStructuralChange
      ? ["두 실행 사이에 테스트 단계가 변경되어 일부 단계는 직접 비교되지 않을 수 있습니다."]
      : []),
    ...(input.baselineResult.networkErrors.length > 0 ||
    input.comparisonResult.networkErrors.length > 0
      ? ["네트워크 비교는 저장된 오류 요청만 사용하므로 정상 요청 전체의 변화는 포함하지 않을 수 있습니다."]
      : []),
    "스크린샷은 파일 내용이 아니라 생성 여부 메타데이터만 비교했습니다."
  ];

  return {
    baselineRunStatus: input.baselineRun.status,
    comparisonRunStatus: input.comparisonRun.status,
    baselineCreatedAt: input.baselineRun.createdAt,
    comparisonCreatedAt: input.comparisonRun.createdAt,
    runChangeType: compareRunStatus(
      input.baselineRun.status,
      input.comparisonRun.status,
      hasStructuralChange
    ),
    summary,
    stepComparisons,
    consoleComparisons,
    networkComparisons: network.comparisons,
    networkStatusChanges: network.statusChanges,
    performanceComparison,
    limitations
  };
}
