export type SensitiveDataCategory =
  | "password"
  | "token"
  | "authorization"
  | "cookie"
  | "api_key"
  | "resident_number"
  | "verification_code";

export interface SensitiveDataFinding {
  category: SensitiveDataCategory;
  message: string;
}

const DETECTORS: Array<{
  category: SensitiveDataCategory;
  pattern: RegExp;
  message: string;
}> = [
  {
    category: "authorization",
    pattern: /\bauthorization\s*:\s*(?:bearer\s+)?[a-z0-9._~+/-]{8,}/i,
    message: "Authorization 값으로 보이는 문자열이 있습니다."
  },
  {
    category: "token",
    pattern: /\bbearer\s+[a-z0-9._~+/-]{8,}/i,
    message: "Bearer 토큰으로 보이는 문자열이 있습니다."
  },
  {
    category: "token",
    pattern: /\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}(?:\.[a-z0-9_-]+)?\b/i,
    message: "JWT 토큰으로 보이는 문자열이 있습니다."
  },
  {
    category: "api_key",
    pattern: /\b(?:api[\s_-]?key|secret)\s*(?::|=|\bis\b)\s*["']?[a-z0-9_-]{8,}/i,
    message: "API 키 또는 secret 값으로 보이는 문자열이 있습니다."
  },
  {
    category: "api_key",
    pattern: /\bsk-[a-z0-9_-]{12,}\b/i,
    message: "API 키 형태의 문자열이 있습니다."
  },
  {
    category: "password",
    pattern: /\bpassword\s*(?::|=|\bis\b)\s*["']?[^\s,"']{6,}/i,
    message: "실제 비밀번호로 보이는 값이 있습니다."
  },
  {
    category: "password",
    pattern: /비밀번호\s*(?::|=|은|는|에|로)\s*["']?[^\s,"']{6,}/i,
    message: "실제 비밀번호로 보이는 값이 있습니다."
  },
  {
    category: "token",
    pattern: /\b(?:access[\s_-]?token|token)\s*(?::|=|\bis\b)\s*["']?[a-z0-9._~+/-]{8,}/i,
    message: "실제 토큰으로 보이는 값이 있습니다."
  },
  {
    category: "cookie",
    pattern: /\bcookie\s*:\s*[^\s,;=]+=[^\s,;]{4,}/i,
    message: "Cookie 값으로 보이는 문자열이 있습니다."
  },
  {
    category: "resident_number",
    pattern: /\b\d{6}-[1-4]\d{6}\b/,
    message: "주민등록번호 형태의 값이 있습니다."
  },
  {
    category: "verification_code",
    pattern: /(?:인증번호|verification\s*code)\s*(?::|=|은|는|\bis\b)\s*\d{4,8}/i,
    message: "휴대폰 인증번호로 보이는 값이 있습니다."
  }
];

export function detectSensitiveData(
  text: string,
  allowedEnvironmentVariables: readonly string[] = []
): SensitiveDataFinding[] {
  let scanTarget = text.replace(/\{\{[A-Z][A-Z0-9_]{0,63}\}\}/g, "");
  for (const name of allowedEnvironmentVariables) {
    scanTarget = scanTarget.replaceAll(name, "");
  }

  const findings = DETECTORS.filter(({ pattern }) =>
    pattern.test(scanTarget)
  ).map(({ category, message }) => ({ category, message }));

  return findings.filter(
    (finding, index) =>
      findings.findIndex(
        (candidate) => candidate.category === finding.category
      ) === index
  );
}
