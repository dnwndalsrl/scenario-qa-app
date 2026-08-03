import { describe, expect, it } from "vitest";
import { assertSafeTestTargetUrl } from "./test-target-url-policy.js";

const denyLocal = { allowLocalTargets: false, allowedLocalPorts: new Set<number>() };
const allowLocal = { allowLocalTargets: true, allowedLocalPorts: new Set([3000, 3001]) };

describe("test target URL policy", () => {
  it("allows public HTTP and HTTPS targets", () => { expect(assertSafeTestTargetUrl("https://qa.example.com/login", denyLocal).hostname).toBe("qa.example.com"); });
  it.each(["file:///etc/passwd", "ftp://example.com/file", "http://169.254.169.254/latest", "http://10.0.0.1", "http://user:pw@example.com"])("blocks unsafe target %s", (value) => { expect(() => assertSafeTestTargetUrl(value, denyLocal)).toThrow(); });
  it("allows local development only on explicitly configured ports", () => { expect(assertSafeTestTargetUrl("http://127.0.0.1:3000/login", allowLocal).port).toBe("3000"); expect(() => assertSafeTestTargetUrl("http://localhost:4444", allowLocal)).toThrow(); });
});
