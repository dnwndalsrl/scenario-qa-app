import { createHash } from "node:crypto";
import type { GeneratedTestScenario, TestDeduplicationResult } from "../../../shared/types/analysis";
export function testFingerprint(test: GeneratedTestScenario): string {
  const normalized = { pageId: test.pageId || "site", category: test.category, purpose: test.purpose.toLowerCase().replace(/\s+/g, " ").trim(), sources: [...test.sourceElementIds].sort(), steps: test.steps.map((step) => ({ action: step.action, elementId: step.elementId, locator: step.locator ? `${step.locator.strategy}:${step.locator.value}` : undefined, expected: step.expected?.trim().toLowerCase() })) };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
export function deduplicateTests(tests: GeneratedTestScenario[]): { tests: GeneratedTestScenario[]; result: TestDeduplicationResult } {
  const kept = new Map<string, GeneratedTestScenario>(); const groups = new Map<string, string[]>();
  for (const test of tests) { const fingerprint = testFingerprint(test); if (!kept.has(fingerprint)) kept.set(fingerprint, test); else groups.set(fingerprint, [...(groups.get(fingerprint) || []), test.id]); }
  const deduplicated = [...kept.values()];
  return { tests: deduplicated, result: { originalCount: tests.length, deduplicatedCount: deduplicated.length, removedCount: tests.length - deduplicated.length, groups: [...groups].map(([fingerprint, removedTestIds]) => ({ fingerprint, keptTestId: kept.get(fingerprint)!.id, removedTestIds })) } };
}
