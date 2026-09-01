import { describe, expect, it } from "vitest";
import { decryptAnalysisAuthentication, encryptAnalysisAuthentication } from "./analysis-authentication";

const secret = "test-only-encryption-key-with-at-least-32-characters";
const credentials = { loginUrl: "https://example.com/login", username: "qa@example.com", password: "private-password" };

describe("analysis authentication encryption", () => {
  it("round-trips credentials without storing plaintext", () => {
    const encrypted = encryptAnalysisAuthentication(credentials, secret);
    expect(JSON.stringify(encrypted)).not.toContain(credentials.username);
    expect(JSON.stringify(encrypted)).not.toContain(credentials.password);
    expect(decryptAnalysisAuthentication(encrypted, secret)).toEqual(credentials);
  });

  it("rejects a different encryption key", () => {
    const encrypted = encryptAnalysisAuthentication(credentials, secret);
    expect(() => decryptAnalysisAuthentication(encrypted, "another-test-encryption-key-with-32-characters")).toThrow("복호화");
  });

  it("requires a sufficiently long server key", () => {
    expect(() => encryptAnalysisAuthentication(credentials, "short")).toThrow("암호화 키");
  });
});
