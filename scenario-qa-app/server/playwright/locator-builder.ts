import type { LocatorCandidate } from "../../shared/types/analysis";

export interface RawElementForLocator { tagName: string; role?: string; accessibleName?: string; label?: string; placeholder?: string; testId?: string; text?: string; id?: string; classes?: string[]; }

export function buildLocatorCandidates(element: RawElementForLocator): LocatorCandidate[] {
  const candidates: LocatorCandidate[] = [];
  const add = (strategy: LocatorCandidate["strategy"], value: string | undefined, score: number) => {
    const trimmed = value?.trim(); if (trimmed && trimmed.length <= 500 && !candidates.some((item) => item.strategy === strategy && item.value === trimmed)) candidates.push({ strategy, value: trimmed, score, unique: false });
  };
  add("test_id", element.testId, 100);
  if (element.role && element.accessibleName) add("role", `${element.role}::${element.accessibleName}`, 90);
  add("label", element.label, 80);
  add("placeholder", element.placeholder, 70);
  if ((element.text?.length ?? 0) <= 120) add("text", element.text, 60);
  if (element.id && !/\d{4,}|[a-f0-9]{8,}/i.test(element.id)) add("css", `#${cssEscape(element.id)}`, 50);
  const stableClass = element.classes?.find((name) => name.length < 50 && !/[a-f0-9]{8,}|^css-|^sc-/i.test(name));
  if (stableClass) add("css", `${element.tagName}.${cssEscape(stableClass)}`, 35);
  if (!candidates.length) add("css", element.tagName, 10);
  return candidates.sort((a, b) => b.score - a.score);
}

function cssEscape(value: string): string { return value.replace(/([^a-zA-Z0-9_-])/g, "\\$1"); }
