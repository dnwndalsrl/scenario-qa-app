import { AppError } from "../../shared/errors";

const TRACKING = /^(utm_.+|gclid|fbclid|ref|source)$/i;

export function normalizeCrawlUrl(input: string, baseUrl: string, includeQueryUrls: boolean): string {
  let url: URL;
  try { url = new URL(input, baseUrl); } catch { throw new AppError("ANALYSIS_INVALID_URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 2048) throw new AppError("ANALYSIS_URL_NOT_ALLOWED");
  url.hostname = url.hostname.toLowerCase(); url.hash = "";
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  const params = [...url.searchParams.entries()].filter(([key]) => !TRACKING.test(key));
  url.search = "";
  if (includeQueryUrls) for (const [key, value] of params.sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv))) url.searchParams.append(key, value);
  return url.toString();
}

export function hasOnlyFragmentDifference(input: string, baseUrl: string): boolean {
  try { const raw = new URL(input, baseUrl); const base = new URL(baseUrl); return Boolean(raw.hash) && raw.origin === base.origin && raw.pathname === base.pathname && raw.search === base.search; }
  catch { return false; }
}
