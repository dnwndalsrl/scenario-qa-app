import type { CrawlSkipReason, DiscoveredLink } from "../../shared/types/analysis";
import { hasOnlyFragmentDifference, normalizeCrawlUrl } from "./url-normalizer";
import { isSameOrigin } from "./origin-policy";

const DOWNLOAD = /\.(pdf|zip|rar|7z|exe|dmg|pkg|docx?|xlsx?|pptx?|csv|mp3|mp4|avi|mov)(?:$|[?#])/i;
const DANGER_SEGMENT = /^(logout|signout|delete|remove|withdraw|unsubscribe|payment|checkout|purchase|order|refund|cancel|로그아웃|탈퇴|삭제|결제|구매|주문|환불|취소|해지)$/i;
const DANGER_TEXT = /\b(log\s*out|sign\s*out|delete|remove|withdraw|unsubscribe|payment|checkout|purchase|refund|cancel)\b|로그아웃|탈퇴|삭제|결제|구매|주문|환불|취소|해지/i;

export interface UrlFilterResult { allowed: boolean; normalizedUrl?: string; reason?: CrawlSkipReason; }

export function filterCrawlLink(link: Pick<DiscoveredLink, "href" | "text" | "accessibleName" | "noFollow" | "download">, baseUrl: string, entryUrl: string, options: { includeQueryUrls: boolean; respectNoFollow: boolean }): UrlFilterResult {
  const raw = link.href.trim();
  if (/^mailto:/i.test(raw)) return { allowed: false, reason: "mailto" };
  if (/^(tel|sms):/i.test(raw)) return { allowed: false, reason: "telephone" };
  if (/^(javascript|data|file|ftp|blob):/i.test(raw)) return { allowed: false, reason: "blocked_protocol" };
  if (link.download || DOWNLOAD.test(raw)) return { allowed: false, reason: "download_link" };
  if (options.respectNoFollow && link.noFollow) return { allowed: false, reason: "nofollow" };
  if (hasOnlyFragmentDifference(raw, baseUrl)) return { allowed: false, reason: "fragment_only" };
  let normalizedUrl: string;
  try { normalizedUrl = normalizeCrawlUrl(raw, baseUrl, options.includeQueryUrls); } catch { return { allowed: false, reason: "blocked_protocol" }; }
  if (!isSameOrigin(normalizedUrl, entryUrl)) return { allowed: false, reason: "external_origin" };
  const url = new URL(normalizedUrl); const segments = url.pathname.split("/").filter(Boolean).map(decodeSafely);
  const label = `${link.text || ""} ${link.accessibleName || ""}`;
  if (segments.some((segment) => DANGER_SEGMENT.test(segment)) && (DANGER_TEXT.test(label) || segments.some((segment) => /logout|signout|delete|payment|checkout|로그아웃|탈퇴|삭제|결제/i.test(segment)))) return { allowed: false, reason: /logout|signout|로그아웃/i.test(`${url.pathname} ${label}`) ? "logout" : "dangerous_path" };
  return { allowed: true, normalizedUrl };
}
function decodeSafely(value: string) { try { return decodeURIComponent(value); } catch { return value; } }
