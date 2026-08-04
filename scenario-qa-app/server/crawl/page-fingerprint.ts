import { createHash } from "node:crypto";
import type { PageSnapshot, PageType } from "../../shared/types/analysis";
import { normalizeUrlPattern } from "./url-pattern";
export function createPageFingerprint(snapshot: PageSnapshot, pageType: PageType = "unknown"): string {
  const value = { pageType, pattern: normalizeUrlPattern(snapshot.finalUrl), headings: snapshot.headings.map((h) => h.level), elements: snapshot.elements.map((e) => `${e.type}:${e.role || ""}`), forms: snapshot.forms.map((f) => `${f.method}:${f.fieldElementIds.length}`) };
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
