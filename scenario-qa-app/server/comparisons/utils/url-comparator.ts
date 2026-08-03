import type { UrlComparisonResult } from "../../../shared/types/test-run-comparison.js";

const SENSITIVE_QUERY_KEYS = /(?:token|authorization|code|password|secret|key|session|email|phone)/i;
const DYNAMIC_QUERY_KEYS = /^(?:_|cb|cacheBust|timestamp|ts|nonce|requestId|traceId)$/i;

interface NormalizedUrlParts {
  display: string;
  origin: string;
  pathname: string;
  query: string;
  hash: string;
}

export function compareUrls(
  baselineUrl: string | undefined,
  comparisonUrl: string | undefined,
  includeHash = false
): UrlComparisonResult {
  const baseline = normalizeUrlParts(baselineUrl, includeHash);
  const comparison = normalizeUrlParts(comparisonUrl, includeHash);
  const originChanged = baseline.origin !== comparison.origin;
  const pathnameChanged = baseline.pathname !== comparison.pathname;
  const queryChanged = baseline.query !== comparison.query;
  const hashChanged = includeHash && baseline.hash !== comparison.hash;
  return {
    changed: originChanged || pathnameChanged || queryChanged || hashChanged,
    ...(baseline.display.length === 0 ? {} : { baselineUrl: baseline.display }),
    ...(comparison.display.length === 0
      ? {}
      : { comparisonUrl: comparison.display }),
    originChanged,
    pathnameChanged,
    queryChanged,
    hashChanged
  };
}

export function normalizeUrlForFingerprint(value: string): string {
  const parts = normalizeUrlParts(value, false);
  return `${parts.origin}${parts.pathname}` || "[알 수 없는 URL]";
}

function normalizeUrlParts(
  value: string | undefined,
  includeHash: boolean
): NormalizedUrlParts {
  if (value === undefined || value.trim().length === 0) {
    return { display: "", origin: "", pathname: "", query: "", hash: "" };
  }
  const raw = value.trim();
  const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(raw);
  try {
    const url = new URL(raw, "http://comparison.local");
    url.username = "";
    url.password = "";
    const entries = [...url.searchParams.entries()]
      .filter(([key]) => !DYNAMIC_QUERY_KEYS.test(key))
      .map(([key, itemValue]) => [
        key,
        SENSITIVE_QUERY_KEYS.test(key) ? "[REDACTED]" : itemValue
      ] as const)
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        `${leftKey}=${leftValue}`.localeCompare(`${rightKey}=${rightValue}`)
      );
    const query = entries
      .map(([key, itemValue]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(itemValue)}`
      )
      .join("&");
    const pathname =
      url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "/";
    const origin = absolute ? url.origin : "";
    const hash = includeHash ? url.hash : "";
    return {
      display: `${origin}${pathname}${query ? `?${query}` : ""}${hash}`,
      origin,
      pathname,
      query,
      hash
    };
  } catch {
    return {
      display: "[유효하지 않은 URL]",
      origin: "",
      pathname: "[유효하지 않은 URL]",
      query: "",
      hash: ""
    };
  }
}
