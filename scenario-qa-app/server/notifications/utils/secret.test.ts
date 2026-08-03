import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskEmail, validateSlackWebhookUrl } from "./secret.js";

describe("notification secrets", () => {
  it("encrypts with randomized authenticated ciphertext and decrypts", () => {
    const secret = "https://hooks.slack.com/services/T000/B000/abc";
    const first = encryptSecret(secret, "0123456789abcdef-test-key");
    const second = encryptSecret(secret, "0123456789abcdef-test-key");
    expect(first).not.toBe(second);
    expect(first).not.toContain("hooks.slack.com");
    expect(decryptSecret(first, "0123456789abcdef-test-key")).toBe(secret);
  });

  it("allows only Slack HTTPS incoming webhook URLs", () => {
    expect(validateSlackWebhookUrl("https://hooks.slack.com/services/T/B/C")).toContain("hooks.slack.com");
    expect(() => validateSlackWebhookUrl("https://example.com/services/T/B/C")).toThrow();
    expect(() => validateSlackWebhookUrl("http://hooks.slack.com/services/T/B/C")).toThrow();
  });

  it("masks email local parts", () => {
    expect(maskEmail("quality@example.com")).toBe("qu*****@example.com");
  });
});
