import type { JsonValue } from "../../../shared/types/test-run.js";
import type {
  StepComparison,
  StepComparisonDetail
} from "../../../shared/types/test-run-comparison.js";
import type {
  ComparisonConfig,
  StepMatch
} from "../types/test-run-comparison.js";
import {
  normalizeDynamicString,
  normalizeJsonValue,
  stableStringify
} from "./actual-value-normalizer.js";
import { compareDuration } from "./duration-comparator.js";
import { compareStepStatus } from "./run-status-comparator.js";
import { targetKey } from "./step-matcher.js";
import { compareUrls } from "./url-comparator.js";

export function compareStepMatch(
  match: StepMatch,
  index: number,
  config: ComparisonConfig
): StepComparison {
  const baseline = match.baseline;
  const comparison = match.comparison;
  if (baseline === undefined) {
    if (comparison === undefined) {
      throw new Error("비교할 단계가 없습니다.");
    }
    return unmatchedStep(`step-comparison-${index + 1}`, "added", comparison, true);
  }
  if (comparison === undefined) {
    return unmatchedStep(`step-comparison-${index + 1}`, "removed", baseline, false);
  }

  const duration = compareDuration(
    baseline.result.durationMs,
    comparison.result.durationMs,
    config
  );
  const expectedChanged =
    stableStringify(baseline.result.expected) !==
    stableStringify(comparison.result.expected);
  const actualChanged =
    stableStringify(baseline.result.actual) !==
    stableStringify(comparison.result.actual);
  const urlComparison = compareUrls(
    baseline.result.currentUrl,
    comparison.result.currentUrl
  );
  const baselineError = normalizeDynamicString(
    baseline.result.errorMessage ?? ""
  );
  const comparisonError = normalizeDynamicString(
    comparison.result.errorMessage ?? ""
  );
  const errorMessageChanged = baselineError !== comparisonError;
  const targetChanged =
    targetKey(baseline.definition?.target) !==
    targetKey(comparison.definition?.target);

  const details: StepComparisonDetail[] = [
    detail(
      "target",
      "대상 요소",
      targetChanged,
      asJson(baseline.definition?.target),
      asJson(comparison.definition?.target)
    ),
    detail(
      "expected",
      "기대 결과",
      expectedChanged,
      normalizeJsonValue(baseline.result.expected),
      normalizeJsonValue(comparison.result.expected)
    ),
    detail(
      "actual",
      "실제 결과",
      actualChanged,
      normalizeJsonValue(baseline.result.actual),
      normalizeJsonValue(comparison.result.actual)
    ),
    detail(
      "url",
      "실행 URL",
      urlComparison.changed,
      urlComparison.baselineUrl,
      urlComparison.comparisonUrl
    ),
    detail(
      "error_message",
      "오류 메시지",
      errorMessageChanged,
      baselineError || undefined,
      comparisonError || undefined
    )
  ];

  return {
    id: `step-comparison-${index + 1}`,
    baselineStepId: baseline.result.stepId,
    comparisonStepId: comparison.result.stepId,
    baselineOrder: baseline.order,
    comparisonOrder: comparison.order,
    baselineName: normalizeDynamicString(baseline.result.stepName),
    comparisonName: normalizeDynamicString(comparison.result.stepName),
    baselineAction: baseline.result.action,
    comparisonAction: comparison.result.action,
    matchType: match.matchType,
    matchConfidence: match.confidence,
    changeType: compareStepStatus(
      baseline.result.status,
      comparison.result.status
    ),
    baselineStatus: baseline.result.status,
    comparisonStatus: comparison.result.status,
    ...(duration.differenceMs === undefined
      ? {}
      : { durationDifferenceMs: duration.differenceMs }),
    ...(duration.changeRate === undefined
      ? {}
      : { durationChangeRate: duration.changeRate }),
    performanceChange: duration.change,
    expectedChanged,
    actualChanged,
    urlChanged: urlComparison.changed,
    errorMessageChanged,
    targetChanged,
    baselineScreenshotAvailable:
      baseline.result.screenshotArtifactId !== null,
    comparisonScreenshotAvailable:
      comparison.result.screenshotArtifactId !== null,
    details
  };
}

function unmatchedStep(
  id: string,
  changeType: "added" | "removed",
  step: NonNullable<StepMatch["baseline"]>,
  isComparison: boolean
): StepComparison {
  return {
    id,
    ...(isComparison
      ? {
          comparisonStepId: step.result.stepId,
          comparisonOrder: step.order,
          comparisonName: normalizeDynamicString(step.result.stepName),
          comparisonAction: step.result.action,
          comparisonStatus: step.result.status
        }
      : {
          baselineStepId: step.result.stepId,
          baselineOrder: step.order,
          baselineName: normalizeDynamicString(step.result.stepName),
          baselineAction: step.result.action,
          baselineStatus: step.result.status
        }),
    matchType: "unmatched",
    matchConfidence: 0,
    changeType,
    expectedChanged: true,
    actualChanged: true,
    urlChanged: true,
    errorMessageChanged: true,
    targetChanged: true,
    baselineScreenshotAvailable:
      !isComparison && step.result.screenshotArtifactId !== null,
    comparisonScreenshotAvailable:
      isComparison && step.result.screenshotArtifactId !== null,
    details: []
  };
}

function detail(
  field: StepComparisonDetail["field"],
  label: string,
  changed: boolean,
  baselineValue: JsonValue | undefined,
  comparisonValue: JsonValue | undefined
): StepComparisonDetail {
  return {
    field,
    label,
    changed,
    ...(baselineValue === undefined ? {} : { baselineValue }),
    ...(comparisonValue === undefined ? {} : { comparisonValue })
  };
}

function asJson(value: unknown): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return normalizeJsonValue(value as JsonValue);
}
