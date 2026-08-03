import { createHash } from "node:crypto";
import type { NetworkErrorEntry } from "../../../shared/types/test-run.js";
import type {
  NetworkErrorComparison,
  NetworkStatusChange
} from "../../../shared/types/test-run-comparison.js";
import { sanitizeLogMessage } from "../../ai/utils/log-sanitizer.js";
import { normalizeUrlForFingerprint } from "./url-comparator.js";

interface NetworkItem {
  fingerprint: string;
  routeKey: string;
  method: string;
  normalizedUrl: string;
  status: number | null;
  resourceType: string;
  failureText: string | null;
}

export function createNetworkFingerprint(entry: NetworkErrorEntry): NetworkItem {
  const method = entry.method.toUpperCase().slice(0, 20);
  const normalizedUrl = normalizeUrlForFingerprint(entry.url);
  const resourceType = entry.resourceType.toLowerCase().slice(0, 50);
  const failureText =
    entry.failureText === null
      ? null
      : normalizeNetworkFailureText(entry.failureText);
  const routeKey = [method, normalizedUrl, resourceType].join("\u0000");
  const signature = [
    routeKey,
    entry.status ?? "failed",
    failureText ?? ""
  ].join("\u0000");
  return {
    fingerprint: createHash("sha256").update(signature).digest("hex").slice(0, 24),
    routeKey,
    method,
    normalizedUrl,
    status: entry.status,
    resourceType,
    failureText
  };
}

export function normalizeNetworkFailureText(value: string): string {
  return sanitizeLogMessage(value, 1000)
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g, "[TIMESTAMP]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[UUID]")
    .replace(/\b\d{10,}\b/g, "[DYNAMIC_ID]")
    .replace(/\s+/g, " ")
    .trim();
}

export function compareNetworkErrors(
  baseline: NetworkErrorEntry[],
  comparison: NetworkErrorEntry[],
  maxItems: number
): {
  comparisons: NetworkErrorComparison[];
  statusChanges: NetworkStatusChange[];
} {
  const left = groupNetworkItems(baseline, maxItems);
  const right = groupNetworkItems(comparison, maxItems);
  const consumedLeft = new Set<string>();
  const consumedRight = new Set<string>();
  const comparisons: NetworkErrorComparison[] = [];
  const statusChanges: NetworkStatusChange[] = [];

  for (const [fingerprint, baselineGroup] of left) {
    const comparisonGroup = right.get(fingerprint);
    if (comparisonGroup === undefined) {
      continue;
    }
    consumedLeft.add(fingerprint);
    consumedRight.add(fingerprint);
    comparisons.push(toComparison("persistent", baselineGroup, comparisonGroup));
  }

  const unmatchedLeft = [...left.entries()].filter(([key]) => !consumedLeft.has(key));
  const unmatchedRight = [...right.entries()].filter(([key]) => !consumedRight.has(key));
  for (const [leftKey, baselineGroup] of unmatchedLeft) {
    const candidates = unmatchedRight.filter(
      ([rightKey, comparisonGroup]) =>
        !consumedRight.has(rightKey) &&
        comparisonGroup.item.routeKey === baselineGroup.item.routeKey
    );
    if (candidates.length !== 1) {
      continue;
    }
    const candidate = candidates[0];
    if (candidate === undefined) {
      continue;
    }
    const [rightKey, comparisonGroup] = candidate;
    consumedLeft.add(leftKey);
    consumedRight.add(rightKey);
    comparisons.push(toComparison("status_changed", baselineGroup, comparisonGroup));
    statusChanges.push({
      method: baselineGroup.item.method,
      normalizedUrl: baselineGroup.item.normalizedUrl,
      baselineStatus: baselineGroup.item.status,
      comparisonStatus: comparisonGroup.item.status,
      changeType: classifyStatusChange(
        baselineGroup.item.status,
        comparisonGroup.item.status
      )
    });
  }

  for (const [key, group] of left) {
    if (!consumedLeft.has(key)) {
      comparisons.push(toComparison("resolved", group));
      statusChanges.push({
        method: group.item.method,
        normalizedUrl: group.item.normalizedUrl,
        baselineStatus: group.item.status,
        changeType: "removed_failure"
      });
    }
  }
  for (const [key, group] of right) {
    if (!consumedRight.has(key)) {
      comparisons.push(toComparison("new", undefined, group));
      statusChanges.push({
        method: group.item.method,
        normalizedUrl: group.item.normalizedUrl,
        comparisonStatus: group.item.status,
        changeType: "new_failure"
      });
    }
  }

  return {
    comparisons: comparisons.sort(
      (a, b) => networkRank(a.changeType) - networkRank(b.changeType)
    ),
    statusChanges
  };
}

function groupNetworkItems(
  entries: NetworkErrorEntry[],
  maxItems: number
): Map<string, { item: NetworkItem; count: number }> {
  const groups = new Map<string, { item: NetworkItem; count: number }>();
  for (const entry of entries.slice(0, maxItems)) {
    const item = createNetworkFingerprint(entry);
    const current = groups.get(item.fingerprint);
    if (current === undefined) {
      groups.set(item.fingerprint, { item, count: 1 });
    } else {
      current.count += 1;
    }
  }
  return groups;
}

function toComparison(
  changeType: NetworkErrorComparison["changeType"],
  baseline?: { item: NetworkItem; count: number },
  comparison?: { item: NetworkItem; count: number }
): NetworkErrorComparison {
  const item = comparison?.item ?? baseline?.item;
  if (item === undefined) {
    throw new Error("네트워크 비교 항목이 없습니다.");
  }
  const failureText =
    comparison?.item.failureText ?? baseline?.item.failureText;
  return {
    fingerprint: comparison?.item.fingerprint ?? baseline?.item.fingerprint ?? "",
    changeType,
    method: item.method,
    normalizedUrl: item.normalizedUrl,
    ...(baseline === undefined ? {} : { baselineStatus: baseline.item.status }),
    ...(comparison === undefined ? {} : { comparisonStatus: comparison.item.status }),
    resourceType: item.resourceType,
    ...(failureText === undefined ? {} : { failureText }),
    baselineCount: baseline?.count ?? 0,
    comparisonCount: comparison?.count ?? 0
  };
}

function classifyStatusChange(
  baseline: number | null,
  comparison: number | null
): NetworkStatusChange["changeType"] {
  const baselineSuccess = baseline !== null && baseline >= 200 && baseline < 400;
  const comparisonSuccess = comparison !== null && comparison >= 200 && comparison < 400;
  if (baselineSuccess && !comparisonSuccess) {
    return "regression";
  }
  if (!baselineSuccess && comparisonSuccess) {
    return "resolved";
  }
  if (
    baseline !== null &&
    comparison !== null &&
    baseline >= 400 && baseline < 500 && comparison >= 500
  ) {
    return "regression";
  }
  return "status_changed";
}

function networkRank(value: NetworkErrorComparison["changeType"]): number {
  return value === "new" || value === "status_changed"
    ? 0
    : value === "persistent"
      ? 1
      : 2;
}
