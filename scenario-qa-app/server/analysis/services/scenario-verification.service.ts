import type { DiscoveredElement, GeneratedTestScenario, GeneratedTestStep, PageSnapshot } from "../../../shared/types/analysis";
import { createId } from "../../utils/id";

export function ensureScenarioAssertions(scenario: GeneratedTestScenario, snapshot: PageSnapshot): GeneratedTestScenario {
  const steps: GeneratedTestStep[] = [];
  for (const step of scenario.steps) {
    steps.push(step);
    if (step.action !== "click" || nextStepIsAssertion(scenario.steps, step.order)) continue;
    const element = step.elementId ? snapshot.elements.find((item) => item.id === step.elementId) : undefined;
    const assertion = clickAssertion(step, element, snapshot.finalUrl);
    if (assertion) steps.push(assertion);
  }

  const normalizedSteps = steps.map((step, index) => ({ ...step, order: index + 1 }));
  const hasAssertion = normalizedSteps.some((step) => isAssertionStep(step));
  return {
    ...scenario,
    steps: normalizedSteps,
    safetyLevel: hasAssertion ? scenario.safetyLevel : "review_required",
    autoExecutable: hasAssertion && scenario.autoExecutable,
    safetyReasons: hasAssertion
      ? scenario.safetyReasons
      : [...new Set([...scenario.safetyReasons, "예상 결과를 자동으로 판정할 검증 단계가 없습니다."])]
  };
}

export function isAssertionStep(step: Pick<GeneratedTestStep, "action">): boolean {
  return step.action.startsWith("assert_");
}

function nextStepIsAssertion(steps: GeneratedTestStep[], order: number): boolean {
  const next = [...steps].sort((left, right) => left.order - right.order).find((step) => step.order > order);
  return Boolean(next && isAssertionStep(next));
}

function clickAssertion(step: GeneratedTestStep, element: DiscoveredElement | undefined, pageUrl: string): GeneratedTestStep | undefined {
  const expected = inferClickExpected(step.expected, element?.href, pageUrl);
  if (!expected) return stateAttributeAssertion(step, element);
  if (expected.kind === "url") {
    return {
      id: createId("step"), order: step.order + 1, action: "assert_url",
      description: "클릭 후 예상 URL로 이동했는지 확인", expected: expected.value,
      evidence: [...new Set([...step.evidence, ...(step.elementId ? [`근거 요소: ${step.elementId}`] : [])])]
    };
  }
  return {
    id: createId("step"), order: step.order + 1, action: "assert_scroll",
    description: expected.value === "changed" ? "클릭 후 스크롤이 이동했는지 확인" : `클릭 후 ${expected.value} 섹션이 화면에 표시되는지 확인`,
    expected: expected.value, evidence: [...new Set([...step.evidence, ...(step.elementId ? [`근거 요소: ${step.elementId}`] : [])])]
  };
}

function stateAttributeAssertion(step: GeneratedTestStep, element: DiscoveredElement | undefined): GeneratedTestStep | undefined {
  const toggles: Record<string, Record<string, string>> = {
    "aria-expanded": { false: "true", true: "false" },
    "aria-selected": { false: "true", true: "false" },
    "aria-pressed": { false: "true", true: "false" },
    "aria-checked": { false: "true", true: "false" },
    "data-state": { closed: "open", open: "closed" }
  };
  const entry = Object.entries(element?.stateAttributes || {}).find(([name, value]) => toggles[name]?.[value]);
  const locator = element?.locatorCandidates.find((candidate) => candidate.unique);
  if (!entry || !element || !locator) return undefined;
  const [name, current] = entry;
  return {
    id: createId("step"), order: step.order + 1, action: "assert_attribute", description: `클릭 후 ${name} 상태가 변경되었는지 확인`,
    elementId: element.id, locator, value: name, expected: toggles[name]![current]!, evidence: [...new Set([...step.evidence, `초기 ${name}: ${current}`, `근거 요소: ${element.id}`])]
  };
}

function inferClickExpected(expected: string | undefined, href: string | undefined, pageUrl: string): { kind: "url" | "scroll"; value: string } | undefined {
  const explicit = expected?.trim();
  if (explicit === "scroll") return { kind: "scroll", value: "changed" };
  if (explicit?.startsWith("scroll:")) return { kind: "scroll", value: explicit.slice(7).trim() || "changed" };
  if (explicit?.startsWith("url-prefix:") || explicit?.startsWith("url:")) return { kind: "url", value: explicit };
  if (!href || /^(?:javascript|mailto|tel):/i.test(href)) return undefined;
  try {
    const destination = new URL(href, pageUrl);
    const current = new URL(pageUrl);
    const sameDocument = destination.origin === current.origin
      && normalizedPath(destination.pathname) === normalizedPath(current.pathname)
      && destination.search === current.search;
    if (sameDocument && destination.hash) return { kind: "scroll", value: destination.hash };
    if (!sameDocument) return { kind: "url", value: `url-prefix:${destination.href}` };
  } catch { return undefined; }
  return undefined;
}

function normalizedPath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}
