import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "../../shared/errors";
import { getAnalysisConfig } from "../config";

const MAX_URL_LENGTH = 2048;
const LOCAL_NAMES = new Set(["localhost", "localhost.localdomain"]);

export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value || value.length > MAX_URL_LENGTH) throw new AppError("ANALYSIS_INVALID_URL");
  let url: URL;
  try { url = new URL(value); } catch { throw new AppError("ANALYSIS_INVALID_URL"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new AppError("ANALYSIS_URL_NOT_ALLOWED");
  if (url.username || url.password) throw new AppError("ANALYSIS_URL_NOT_ALLOWED", "사용자 이름이나 비밀번호가 포함된 URL은 분석할 수 없습니다.");
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = "";
  if (!url.pathname) url.pathname = "/";
  return url.toString();
}

export function isBlockedAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0]!;
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("::ffff:")) return isBlockedAddress(normalized.slice(7));
  if (isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 100 && b! >= 64 && b! <= 127) || a! >= 224;
}

function localExceptionAllowed(url: URL): boolean {
  const config = getAnalysisConfig();
  if (!config.allowLocalTargets) return false;
  const localHost = LOCAL_NAMES.has(url.hostname) || url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]";
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  return localHost && config.allowedLocalPorts.includes(port);
}

export async function validateTargetUrl(input: string): Promise<string> {
  const normalized = normalizeUrl(input);
  const url = new URL(normalized);
  if (localExceptionAllowed(url)) return normalized;
  if (LOCAL_NAMES.has(url.hostname) || isBlockedAddress(url.hostname)) throw new AppError("ANALYSIS_SSRF_BLOCKED");
  let records: Array<{ address: string }>;
  try { records = await lookup(url.hostname, { all: true, verbatim: true }); }
  catch (error) { throw new AppError("ANALYSIS_DNS_FAILED", undefined, 400, error instanceof Error ? error.message : String(error)); }
  if (!records.length || records.some(({ address }) => isBlockedAddress(address))) throw new AppError("ANALYSIS_SSRF_BLOCKED");
  return normalized;
}

export async function assertRedirectAllowed(url: string): Promise<void> {
  try { await validateTargetUrl(url); }
  catch (error) { if (error instanceof AppError) throw new AppError("ANALYSIS_REDIRECT_BLOCKED", undefined, 400, error.message); throw error; }
}
