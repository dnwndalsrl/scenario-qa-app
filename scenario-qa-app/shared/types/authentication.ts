export interface AnalysisAuthenticationInput {
  loginUrl: string;
  username: string;
  password: string;
}

export interface BrowserAuthentication extends AnalysisAuthenticationInput {}

export interface EncryptedAuthenticationPayload {
  version: 1;
  iv: string;
  ciphertext: string;
  tag: string;
}
