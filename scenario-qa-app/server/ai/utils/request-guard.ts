import { createHash } from "node:crypto";
import { AppError } from "../../utils/api.js";

export interface AiRequestGuardOptions {
  windowMs: number;
  maxRequests: number;
  duplicateTtlMs: number;
}

export interface AiRequestLease {
  release(completed: boolean): void;
}

export class AiRequestGuard {
  private readonly requestTimes = new Map<string, number[]>();
  private readonly inProgress = new Set<string>();
  private readonly recentCompleted = new Map<string, number>();

  constructor(
    private readonly options: AiRequestGuardOptions = {
      windowMs: 60_000,
      maxRequests: 5,
      duplicateTtlMs: 30_000
    },
    private readonly now: () => number = Date.now
  ) {}

  acquire(requesterId: string, contentHash: string): AiRequestLease {
    const now = this.now();
    const requestKey = `${requesterId}:${contentHash}`;
    this.prune(now);
    if (this.inProgress.has(requestKey)) {
      throw new AppError(
        409,
        "AI_REQUEST_IN_PROGRESS",
        "같은 내용의 AI 변환 요청을 처리하고 있습니다. 완료될 때까지 기다려 주세요."
      );
    }
    const recentAt = this.recentCompleted.get(requestKey);
    if (
      recentAt !== undefined &&
      now - recentAt < this.options.duplicateTtlMs
    ) {
      throw new AppError(
        429,
        "AI_RATE_LIMITED",
        "같은 내용을 방금 변환했습니다. 결과를 검토하거나 잠시 후 다시 시도해 주세요."
      );
    }
    const times = (this.requestTimes.get(requesterId) ?? []).filter(
      (time) => now - time < this.options.windowMs
    );
    if (times.length >= this.options.maxRequests) {
      throw new AppError(
        429,
        "AI_RATE_LIMITED",
        "짧은 시간에 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
      );
    }
    times.push(now);
    this.requestTimes.set(requesterId, times);
    this.inProgress.add(requestKey);

    let released = false;
    return {
      release: (completed: boolean): void => {
        if (released) {
          return;
        }
        released = true;
        this.inProgress.delete(requestKey);
        if (completed) {
          this.recentCompleted.set(requestKey, this.now());
        }
      }
    };
  }

  private prune(now: number): void {
    for (const [key, time] of this.recentCompleted) {
      if (now - time >= this.options.duplicateTtlMs) {
        this.recentCompleted.delete(key);
      }
    }
    for (const [key, times] of this.requestTimes) {
      const recent = times.filter(
        (time) => now - time < this.options.windowMs
      );
      if (recent.length === 0) {
        this.requestTimes.delete(key);
      } else {
        this.requestTimes.set(key, recent);
      }
    }
  }
}

export function hashAiConversionContent(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
