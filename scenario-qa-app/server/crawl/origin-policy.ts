export function isSameOrigin(candidate: string, entryUrl: string): boolean {
  try { return new URL(candidate).origin === new URL(entryUrl).origin; } catch { return false; }
}
export function assertSameOrigin(candidate: string, entryUrl: string): void {
  if (!isSameOrigin(candidate, entryUrl)) throw new Error("CRAWL_EXTERNAL_ORIGIN");
}
