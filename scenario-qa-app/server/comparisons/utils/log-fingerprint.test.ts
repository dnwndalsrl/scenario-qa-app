import { describe, expect, it } from "vitest";
import type { ConsoleLogEntry, NetworkErrorEntry } from "../../../shared/types/test-run.js";
import {
  compareConsoleErrors,
  createConsoleFingerprint,
  normalizeConsoleMessage
} from "./console-fingerprint.js";
import {
  compareNetworkErrors,
  createNetworkFingerprint
} from "./network-fingerprint.js";

describe("log fingerprints", () => {
  it("콘솔 오류의 UUID, 긴 ID, 줄 번호와 파일 hash 차이를 제거한다", () => {
    const first = consoleEntry("TypeError 1234567890123 at app.abcdef123.js:20:10 550e8400-e29b-41d4-a716-446655440000");
    const second = consoleEntry("TypeError 9876543210987 at app.9876fedcb.js:40:22 123e4567-e89b-42d3-a456-426614174000");
    expect(createConsoleFingerprint(first).fingerprint).toBe(
      createConsoleFingerprint(second).fingerprint
    );
    expect(normalizeConsoleMessage("password=secret")).not.toContain("secret");
  });

  it("콘솔 오류를 신규, 지속, 해결로 분류한다", () => {
    const result = compareConsoleErrors(
      [consoleEntry("old"), consoleEntry("same")],
      [consoleEntry("same"), consoleEntry("new")],
      [],
      [],
      100
    );
    expect(result.map((item) => item.changeType).sort()).toEqual([
      "new",
      "persistent",
      "resolved"
    ]);
  });

  it("같은 콘솔 오류가 다른 인접 단계에 연결돼도 지속 오류로 본다", () => {
    const step = {
      stepId: "step-a",
      stepName: "A",
      action: "click" as const,
      status: "success" as const,
      startedAt: "2026-08-03T00:00:00.000Z",
      finishedAt: "2026-08-03T00:00:01.000Z",
      durationMs: 1000,
      expected: {},
      actual: {},
      errorMessage: null,
      screenshotArtifactId: null,
      currentUrl: "https://example.com"
    };
    const result = compareConsoleErrors(
      [{ ...consoleEntry("same"), timestamp: "2026-08-03T00:00:00.100Z" }],
      [{ ...consoleEntry("same"), timestamp: "2026-08-03T00:00:02.100Z" }],
      [step],
      [{ ...step, stepId: "step-b", startedAt: "2026-08-03T00:00:02.000Z", finishedAt: "2026-08-03T00:00:03.000Z" }],
      100
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.changeType).toBe("persistent");
  });

  it("네트워크 fingerprint에서 query 민감값과 순서를 무시한다", () => {
    const first = networkEntry(500, "https://example.com/api?a=1&token=secret");
    const second = networkEntry(500, "https://example.com/api?token=other&a=1");
    expect(createNetworkFingerprint(first).fingerprint).toBe(
      createNetworkFingerprint(second).fingerprint
    );
    expect(createNetworkFingerprint(first).normalizedUrl).not.toContain("secret");
  });

  it("동일 요청의 HTTP status 변경을 회귀로 감지한다", () => {
    const result = compareNetworkErrors(
      [networkEntry(200, "https://example.com/api/login")],
      [networkEntry(500, "https://example.com/api/login")],
      100
    );
    expect(result.comparisons[0]?.changeType).toBe("status_changed");
    expect(result.statusChanges[0]?.changeType).toBe("regression");
  });
});

function consoleEntry(text: string): ConsoleLogEntry {
  return { type: "error", text, timestamp: "2026-08-03T00:00:00.000Z" };
}

function networkEntry(status: number, url: string): NetworkErrorEntry {
  return {
    method: "POST",
    url,
    status,
    failureText: null,
    resourceType: "fetch",
    timestamp: "2026-08-03T00:00:00.000Z"
  };
}
