import type { Locator, Page } from "playwright";
import type { LocatorCandidate } from "../../shared/types/analysis";

export function resolveLocator(page: Page, candidate: LocatorCandidate): Locator {
  switch (candidate.strategy) {
    case "test_id": return page.getByTestId(candidate.value);
    case "role": { const [role, ...name] = candidate.value.split("::"); return page.getByRole(role as any, { name: name.join("::"), exact: true }); }
    case "label": return page.getByLabel(candidate.value, { exact: true });
    case "placeholder": return page.getByPlaceholder(candidate.value, { exact: true });
    case "text": return page.getByText(candidate.value, { exact: true });
    case "css": return page.locator(candidate.value);
  }
}

export async function markLocatorUniqueness(page: Page, candidates: LocatorCandidate[]): Promise<LocatorCandidate[]> {
  const checked: LocatorCandidate[] = [];
  for (const candidate of candidates) {
    try { checked.push({ ...candidate, unique: await resolveLocator(page, candidate).count() === 1 }); }
    catch { checked.push({ ...candidate, unique: false }); }
  }
  return checked.sort((a, b) => Number(b.unique) - Number(a.unique) || b.score - a.score);
}
