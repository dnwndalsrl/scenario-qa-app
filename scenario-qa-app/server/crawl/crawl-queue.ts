import type { CrawlQueueItem } from "../../shared/types/analysis";
import { normalizeUrlPattern } from "./url-pattern";

export class CrawlQueue {
  private items: CrawlQueueItem[] = []; private seen = new Set<string>(); private patterns = new Map<string, number>();
  constructor(private readonly maxDepth: number, private readonly maxPages: number, private readonly maxPerPattern: number) {}
  enqueue(item: CrawlQueueItem): "queued" | "duplicate" | "depth_limit" | "page_limit" | "pattern_limit" {
    if (item.depth > this.maxDepth) return "depth_limit";
    if (this.seen.size >= this.maxPages * 20) return "page_limit";
    if (this.seen.has(item.normalizedUrl)) return "duplicate";
    const pattern = normalizeUrlPattern(item.normalizedUrl); const count = this.patterns.get(pattern) || 0;
    if (count >= this.maxPerPattern) return "pattern_limit";
    this.seen.add(item.normalizedUrl); this.patterns.set(pattern, count + 1); this.items.push(item); return "queued";
  }
  dequeue(): CrawlQueueItem | undefined {
    this.items.sort((a, b) => a.depth - b.depth || b.priority.total - a.priority.total || a.enqueuedAt.localeCompare(b.enqueuedAt));
    return this.items.shift();
  }
  get size() { return this.items.length; }
  has(url: string) { return this.seen.has(url); }
}
