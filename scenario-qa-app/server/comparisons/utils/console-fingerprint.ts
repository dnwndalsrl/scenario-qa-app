import { createHash } from "node:crypto";
import type {
  ConsoleLogEntry,
  RunStepResult
} from "../../../shared/types/test-run.js";
import type { ConsoleErrorComparison } from "../../../shared/types/test-run-comparison.js";
import { sanitizeLogMessage } from "../../ai/utils/log-sanitizer.js";

interface ConsoleFingerprintItem {
  fingerprint: string;
  coreKey: string;
  type: string;
  message: string;
  relatedStepId?: string;
}

export function normalizeConsoleMessage(value: string): string {
  const normalized = value
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g, "[TIMESTAMP]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[UUID]")
    .replace(/\b0x[0-9a-f]+\b/gi, "[ADDRESS]")
    .replace(/([:.])\d+:\d+\b/g, "$1[LINE]")
    .replace(/\b(chunk|bundle|app)[.-][0-9a-f]{8,}(?=\.)/gi, "$1-[HASH]")
    .replace(/\b\d{10,}\b/g, "[DYNAMIC_ID]")
    .replace(/\s+at\s+[^\n]+(?:\n|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitizeLogMessage(normalized, 2000);
}

export function createConsoleFingerprint(
  entry: ConsoleLogEntry,
  steps: RunStepResult[] = []
): ConsoleFingerprintItem {
  const type = entry.type.toLowerCase().slice(0, 30);
  const message = normalizeConsoleMessage(entry.text);
  const relatedStepId = findRelatedStepId(entry.timestamp, steps);
  const coreKey = `${type}\u0000${message}`;
  const signature = `${coreKey}\u0000${relatedStepId ?? ""}`;
  return {
    fingerprint: createHash("sha256").update(signature).digest("hex").slice(0, 24),
    coreKey,
    type,
    message,
    ...(relatedStepId === undefined ? {} : { relatedStepId })
  };
}

export function compareConsoleErrors(
  baseline: ConsoleLogEntry[],
  comparison: ConsoleLogEntry[],
  baselineSteps: RunStepResult[],
  comparisonSteps: RunStepResult[],
  maxItems: number
): ConsoleErrorComparison[] {
  const baselineGroups = groupConsoleItems(baseline, baselineSteps, maxItems);
  const comparisonGroups = groupConsoleItems(
    comparison,
    comparisonSteps,
    maxItems
  );
  const consumedLeft = new Set<string>();
  const consumedRight = new Set<string>();
  const results: ConsoleErrorComparison[] = [];

  for (const [fingerprint, left] of baselineGroups) {
    const right = comparisonGroups.get(fingerprint);
    if (right === undefined) continue;
    consumedLeft.add(fingerprint);
    consumedRight.add(fingerprint);
    results.push(toConsoleComparison("persistent", left, right));
  }

  for (const [leftKey, left] of baselineGroups) {
    if (consumedLeft.has(leftKey)) continue;
    const candidates = [...comparisonGroups.entries()].filter(
      ([rightKey, right]) =>
        !consumedRight.has(rightKey) && right.item.coreKey === left.item.coreKey
    );
    if (candidates.length !== 1) continue;
    const candidate = candidates[0];
    if (candidate === undefined) continue;
    const [rightKey, right] = candidate;
    consumedLeft.add(leftKey);
    consumedRight.add(rightKey);
    results.push(toConsoleComparison("persistent", left, right));
  }

  for (const [key, left] of baselineGroups) {
    if (!consumedLeft.has(key)) {
      results.push(toConsoleComparison("resolved", left));
    }
  }
  for (const [key, right] of comparisonGroups) {
    if (!consumedRight.has(key)) {
      results.push(toConsoleComparison("new", undefined, right));
    }
  }
  return results.sort(
    (left, right) => consoleChangeRank(left.changeType) - consoleChangeRank(right.changeType)
  );
}

function groupConsoleItems(
  entries: ConsoleLogEntry[],
  steps: RunStepResult[],
  maxItems: number
): Map<string, { item: ConsoleFingerprintItem; count: number }> {
  const groups = new Map<string, { item: ConsoleFingerprintItem; count: number }>();
  const errorTypes = new Set(["error", "warning", "warn", "assert"]);
  for (const entry of entries.slice(0, maxItems)) {
    if (!errorTypes.has(entry.type.toLowerCase())) {
      continue;
    }
    const item = createConsoleFingerprint(entry, steps);
    const group = groups.get(item.fingerprint);
    if (group === undefined) {
      groups.set(item.fingerprint, { item, count: 1 });
    } else {
      group.count += 1;
    }
  }
  return groups;
}

function findRelatedStepId(
  timestamp: string,
  steps: RunStepResult[]
): string | undefined {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) {
    return undefined;
  }
  return steps.find((step) => {
    const start = Date.parse(step.startedAt);
    const end = Date.parse(step.finishedAt);
    return Number.isFinite(start) && Number.isFinite(end) && time >= start && time <= end + 50;
  })?.stepId;
}

function consoleChangeRank(value: ConsoleErrorComparison["changeType"]): number {
  return value === "new" ? 0 : value === "persistent" ? 1 : 2;
}

function toConsoleComparison(
  changeType: ConsoleErrorComparison["changeType"],
  baseline?: { item: ConsoleFingerprintItem; count: number },
  comparison?: { item: ConsoleFingerprintItem; count: number }
): ConsoleErrorComparison {
  const item = comparison?.item ?? baseline?.item;
  if (item === undefined) throw new Error("콘솔 비교 항목이 없습니다.");
  const relatedStepId = comparison?.item.relatedStepId ?? baseline?.item.relatedStepId;
  return {
    fingerprint: comparison?.item.fingerprint ?? baseline?.item.fingerprint ?? "",
    changeType,
    type: item.type,
    baselineCount: baseline?.count ?? 0,
    comparisonCount: comparison?.count ?? 0,
    ...(baseline === undefined ? {} : { baselineMessage: baseline.item.message }),
    ...(comparison === undefined ? {} : { comparisonMessage: comparison.item.message }),
    ...(relatedStepId === undefined ? {} : { relatedStepId })
  };
}
