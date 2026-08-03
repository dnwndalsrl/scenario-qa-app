export class AnalyticsCache {
  private readonly values = new Map<string, { expiresAt: number; value: unknown }>();
  constructor(private readonly ttlMs: number, private readonly now: () => number = Date.now) {}

  async getOrSet<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.values.get(key);
    if (cached !== undefined && cached.expiresAt > this.now()) return structuredClone(cached.value) as T;
    const value = await loader();
    this.values.set(key, { expiresAt: this.now() + this.ttlMs, value: structuredClone(value) });
    return value;
  }

  clear(): void { this.values.clear(); }
}

export function stableCacheKey(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}
