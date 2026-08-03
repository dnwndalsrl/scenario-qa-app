import type { ElementTarget } from "../../../shared/types/scenario.js";
import type {
  ComparableStep,
  StepMatch
} from "../types/test-run-comparison.js";
import { stableStringify } from "./actual-value-normalizer.js";

export function matchSteps(
  baselineSteps: ComparableStep[],
  comparisonSteps: ComparableStep[],
  minConfidence: number
): StepMatch[] {
  const matches: StepMatch[] = [];
  const unmatchedBaseline = new Set(baselineSteps);
  const unmatchedComparison = new Set(comparisonSteps);

  matchTier("step_id", 1, (left, right) =>
    left.result.stepId === right.result.stepId
  );
  matchTier("order_action", 0.95, (left, right) =>
    left.order === right.order && left.result.action === right.result.action
  );
  matchTier("name_action", 0.9, (left, right) =>
    left.result.action === right.result.action &&
    normalizeName(left.result.stepName) === normalizeName(right.result.stepName)
  );
  matchTier("target_action", 0.85, (left, right) => {
    const leftTarget = targetKey(left.definition?.target);
    const rightTarget = targetKey(right.definition?.target);
    return (
      left.result.action === right.result.action &&
      leftTarget.length > 0 &&
      leftTarget === rightTarget
    );
  });

  for (const baseline of unmatchedBaseline) {
    matches.push({ baseline, matchType: "unmatched", confidence: 0 });
  }
  for (const comparison of unmatchedComparison) {
    matches.push({ comparison, matchType: "unmatched", confidence: 0 });
  }
  return matches.sort(
    (left, right) =>
      (left.baseline?.order ?? left.comparison?.order ?? Number.MAX_SAFE_INTEGER) -
      (right.baseline?.order ?? right.comparison?.order ?? Number.MAX_SAFE_INTEGER)
  );

  function matchTier(
    matchType: Exclude<StepMatch["matchType"], "unmatched">,
    confidence: number,
    predicate: (left: ComparableStep, right: ComparableStep) => boolean
  ): void {
    if (confidence < minConfidence) {
      return;
    }
    for (const baseline of [...unmatchedBaseline]) {
      const candidates = [...unmatchedComparison].filter((comparison) =>
        predicate(baseline, comparison)
      );
      if (candidates.length !== 1) {
        continue;
      }
      const comparison = candidates[0];
      if (comparison === undefined) {
        continue;
      }
      const reverseCandidates = [...unmatchedBaseline].filter((candidate) =>
        predicate(candidate, comparison)
      );
      if (reverseCandidates.length !== 1) {
        continue;
      }
      matches.push({ baseline, comparison, matchType, confidence });
      unmatchedBaseline.delete(baseline);
      unmatchedComparison.delete(comparison);
    }
  }
}

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function targetKey(target: ElementTarget | undefined): string {
  if (target === undefined) {
    return "";
  }
  return stableStringify({
    exact: target.exact ?? false,
    name: normalizeName(target.name ?? ""),
    strategy: target.strategy,
    value: normalizeName(target.value).replace(/\/+$/, "")
  });
}
