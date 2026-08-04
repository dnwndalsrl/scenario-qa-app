const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const HASH = /^[0-9a-f]{16,}$/i;
const DATE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/;
export function normalizeUrlPattern(input: string): string {
  const url = new URL(input);
  const segments = url.pathname.split("/").map((segment) => {
    if (/^\d+$/.test(segment)) return ":id";
    if (UUID.test(segment)) return ":uuid";
    if (HASH.test(segment)) return ":hash";
    if (DATE.test(segment)) return ":date";
    return segment;
  });
  return `${url.origin}${segments.join("/") || "/"}`;
}
