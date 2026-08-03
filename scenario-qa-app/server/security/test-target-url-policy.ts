import { isIP } from "node:net";
import { AppError } from "../utils/api.js";

export interface TestTargetPolicy {
  allowLocalTargets: boolean;
  allowedLocalPorts: Set<number>;
}

export function getTestTargetPolicy(): TestTargetPolicy {
  const configured = process.env.ALLOW_LOCAL_TEST_TARGETS;
  const allowLocalTargets = configured === "true" || (configured === undefined && process.env.NODE_ENV !== "production");
  const ports = (process.env.ALLOWED_LOCAL_TEST_PORTS ?? "3000,3001")
    .split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0 && value <= 65535);
  return { allowLocalTargets, allowedLocalPorts: new Set(ports) };
}

export function assertSafeTestTargetUrl(value: string, policy = getTestTargetPolicy()): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw unsafe("올바른 HTTP 또는 HTTPS URL을 입력해 주세요."); }
  if (!['http:', 'https:'].includes(url.protocol)) throw unsafe("HTTP 또는 HTTPS URL만 사용할 수 있습니다.");
  if (url.username || url.password) throw unsafe("URL에 사용자명이나 비밀번호를 포함할 수 없습니다.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const local = hostname === "localhost" || hostname.endsWith(".localhost") || isPrivateAddress(hostname);
  if (local) {
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    if (!policy.allowLocalTargets || !policy.allowedLocalPorts.has(port)) {
      throw unsafe("localhost와 사설 IP 대상은 허용된 로컬 테스트 포트에서만 사용할 수 있습니다.");
    }
  }
  if (["169.254.169.254", "metadata.google.internal", "metadata.google"].includes(hostname)) throw unsafe("클라우드 메타데이터 주소는 테스트 대상으로 사용할 수 없습니다.");
  url.hash = "";
  return url;
}

function isPrivateAddress(hostname: string): boolean {
  if (hostname === "::1" || hostname === "[::1]" || hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd")) return true;
  if (isIP(hostname) !== 4) return false;
  const [a = 0, b = 0] = hostname.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function unsafe(message: string): AppError { return new AppError(400, "UNSAFE_TEST_TARGET_URL", message); }
