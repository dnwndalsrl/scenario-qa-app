import type { AiPageAnalysis, CrawledPage, SiteMap, SiteMapEdge } from "../../shared/types/analysis";
import { createId } from "../utils/id";
export function buildSiteMap(analysisId: string, pages: CrawledPage[], edges: SiteMapEdge[], analyses: AiPageAnalysis[]): SiteMap {
  const byPage = new Map(analyses.map((value) => [value.pageId, value])); const entry = pages.find((page) => page.depth === 0) || pages[0];
  if (!entry) throw new Error("SITE_MAP_BUILD_FAILED");
  return { id: createId("site-map"), analysisId, entryPageId: entry.id, nodes: pages.map((page) => ({ pageId: page.id, url: page.finalUrl || page.normalizedUrl, title: page.title, depth: page.depth, pageType: byPage.get(page.id)?.pageType, status: page.status, importance: page.priority.total, aliasOfPageId: page.aliasOfPageId })), edges, generatedAt: new Date().toISOString() };
}
