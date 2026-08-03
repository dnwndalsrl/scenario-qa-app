import { describe, expect, it } from "vitest";
import { createPasswordHash, createSessionToken, readSessionToken, verifyPassword } from "./auth.js";

describe("application authentication", () => {
  it("verifies only the password used to create a scrypt hash", () => {
    const hash = createPasswordHash("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(verifyPassword("wrong password", hash)).toBe(false);
  });

  it("rejects tampered and expired session tokens", () => {
    const secret = "a".repeat(32);
    const token = createSessionToken("admin", secret, 1_000);
    expect(readSessionToken(token, secret, 1_001)?.username).toBe("admin");
    expect(readSessionToken(`${token}x`, secret, 1_001)).toBeNull();
    expect(readSessionToken(token, secret, 40_000)).toBeNull();
  });
});
