import { describe, expect, it } from "vitest";
import { AppError } from "../../utils/api.js";
import { AiRequestGuard } from "./request-guard.js";

describe("AiRequestGuard", () => {
  it("처리 중인 동일 요청을 차단한다", () => {
    let now = 0;
    const guard = new AiRequestGuard(
      { windowMs: 60_000, maxRequests: 5, duplicateTtlMs: 30_000 },
      () => now
    );
    const lease = guard.acquire("ip-1", "hash-1");
    expect(() => guard.acquire("ip-1", "hash-1")).toThrowError(
      expect.objectContaining({ code: "AI_REQUEST_IN_PROGRESS" })
    );
    lease.release(false);
    now += 1;
    expect(() => guard.acquire("ip-1", "hash-1")).not.toThrow();
  });

  it("완료 직후 동일 내용 제출을 차단한다", () => {
    let now = 0;
    const guard = new AiRequestGuard(
      { windowMs: 60_000, maxRequests: 5, duplicateTtlMs: 30_000 },
      () => now
    );
    guard.acquire("ip-1", "hash-1").release(true);
    expect(() => guard.acquire("ip-1", "hash-1")).toThrowError(
      expect.objectContaining({ code: "AI_RATE_LIMITED" })
    );
    now = 31_000;
    expect(() => guard.acquire("ip-1", "hash-1")).not.toThrow();
  });

  it("IP별 요청 횟수를 제한한다", () => {
    const guard = new AiRequestGuard(
      { windowMs: 60_000, maxRequests: 2, duplicateTtlMs: 1 },
      () => 10
    );
    guard.acquire("ip-1", "a").release(false);
    guard.acquire("ip-1", "b").release(false);
    try {
      guard.acquire("ip-1", "c");
      throw new Error("rate limit가 적용되지 않았습니다.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("AI_RATE_LIMITED");
    }
  });
});
