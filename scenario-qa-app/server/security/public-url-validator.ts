import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function blocked(address: string): boolean {
  const value = address.toLowerCase().split("%")[0]!;
  if (value === "::" || value === "::1" || /^(fc|fd|fe8|fe9|fea|feb)/.test(value)) return true;
  if (value.startsWith("::ffff:")) return blocked(value.slice(7));
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 100 && b! >= 64 && b! <= 127) || a! >= 224;
}

export async function validatePublicTargetUrl(input: string): Promise<string> {
  let url: URL; try { url = new URL(input.trim()); } catch { throw createError({ statusCode: 400, statusMessage: "올바른 URL을 입력해 주세요." }); }
  if (input.length > 2048 || !["http:", "https:"].includes(url.protocol) || url.username || url.password) throw createError({ statusCode: 400, statusMessage: "허용되지 않는 URL입니다." });
  url.hash = ""; url.hostname = url.hostname.toLowerCase();
  if (["localhost", "localhost.localdomain"].includes(url.hostname) || blocked(url.hostname)) throw createError({ statusCode: 400, statusMessage: "내부 네트워크 주소는 분석할 수 없습니다." });
  let records: Array<{ address: string }>;
  try { records = await lookup(url.hostname, { all: true, verbatim: true }); } catch { throw createError({ statusCode: 400, statusMessage: "도메인 주소를 확인할 수 없습니다." }); }
  if (!records.length || records.some((record) => blocked(record.address))) throw createError({ statusCode: 400, statusMessage: "내부 네트워크로 연결되는 URL은 분석할 수 없습니다." });
  return url.toString();
}
