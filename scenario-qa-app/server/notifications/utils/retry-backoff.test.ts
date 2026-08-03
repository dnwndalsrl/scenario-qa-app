import { describe, expect, it } from "vitest";
import { notificationRetryDelay } from "./retry-backoff.js";

describe("notificationRetryDelay", () => {
  it("calculates the capped 5/10/20 second exponential backoff", () => {
    expect([1, 2, 3, 4].map((attempt) => notificationRetryDelay(attempt))).toEqual([5000, 10000, 20000, 20000]);
  });
});
