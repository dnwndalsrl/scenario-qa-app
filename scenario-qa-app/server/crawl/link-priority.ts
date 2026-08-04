import type { DiscoveredLink, LinkPriorityScore } from "../../shared/types/analysis";
export function scoreLink(link: DiscoveredLink, url: string, depth: number): LinkPriorityScore {
  const reasons: string[] = []; let total = 50; const parsed = new URL(url); const label = `${link.text || ""} ${link.accessibleName || ""}`.trim();
  if (link.region === "header" || link.region === "main") { total += 18; reasons.push("주요 탐색 영역"); }
  if (link.region === "footer") { total -= 5; reasons.push("footer 링크"); }
  if (link.visible !== false) { total += 5; reasons.push("보이는 링크"); }
  if (parsed.pathname.split("/").filter(Boolean).length <= 2) { total += 8; reasons.push("짧은 경로"); }
  if (/login|search|product|article|list|detail|로그인|검색|목록|상세/i.test(`${parsed.pathname} ${label}`)) { total += 10; reasons.push("핵심 기능 링크"); }
  if (label.length >= 2 && label.length <= 50) { total += 5; reasons.push("명확한 이름"); }
  if (depth === 1) { total += 8; reasons.push("시작 페이지 직접 연결"); }
  if ([...parsed.searchParams].length > 2) { total -= 15; reasons.push("복잡한 query"); }
  if (/privacy|terms|policy|약관|개인정보/i.test(`${parsed.pathname} ${label}`)) { total -= 12; reasons.push("정책 페이지"); }
  if (url.length > 180) { total -= 10; reasons.push("긴 URL"); }
  return { total, reasons };
}
