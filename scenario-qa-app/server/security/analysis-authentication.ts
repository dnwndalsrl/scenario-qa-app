import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { AnalysisAuthenticationInput, BrowserAuthentication, EncryptedAuthenticationPayload } from "../../shared/types/authentication";
import { AppError } from "../../shared/errors";

function key(raw: string | undefined): Buffer {
  if (!raw || raw.length < 32) throw new AppError("AUTH_ENCRYPTION_NOT_CONFIGURED", undefined, 503);
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptAnalysisAuthentication(input: AnalysisAuthenticationInput, secret = process.env.ANALYSIS_CREDENTIAL_ENCRYPTION_KEY): EncryptedAuthenticationPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(input), "utf8"), cipher.final()]);
  return { version: 1, iv: iv.toString("base64"), ciphertext: ciphertext.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decryptAnalysisAuthentication(payload: EncryptedAuthenticationPayload, secret = process.env.ANALYSIS_CREDENTIAL_ENCRYPTION_KEY): BrowserAuthentication {
  try {
    if (payload.version !== 1) throw new Error("Unsupported authentication payload version");
    const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]).toString("utf8"));
    if (!value?.loginUrl || !value?.username || !value?.password) throw new Error("Invalid authentication payload");
    return value as BrowserAuthentication;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("AUTH_CREDENTIAL_DECRYPTION_FAILED", undefined, 500);
  }
}
