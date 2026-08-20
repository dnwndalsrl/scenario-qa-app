import type { AutomatedTestRun, GeneratedTestScenario, GeneratedTestStep, LocatorCandidate, PageSnapshot } from "../../shared/types/analysis";

export interface ProductionRegressionSummary {
  overallStatus: "passed" | "passed_with_warnings" | "failed";
  totalCount: number;
  successCount: number;
  productDefectCount: number;
  inconclusiveCount: number;
}

export function buildDoctorAgRegressionScenarios(snapshot: PageSnapshot): GeneratedTestScenario[] {
  const product = headerLink(snapshot, "Product", "/product/");
  const doctor = headerLink(snapshot, "Dr. AG", "/dr-ag/");
  const annual = elementByName(snapshot, "연간 버섯 출하량");
  const top = elementByName(snapshot, "Top");

  return [
    scenario(snapshot, "product-redirect", "Product 리디렉션", [
      step("wait_for_stable", "Product 링크 안정화", product, "150"),
      step("click", "Product 링크 클릭", product)
    ]),
    scenario(snapshot, "dynamic-header-link", "동적 헤더 Dr. AG 이동", [
      step("wait_for_stable", "Dr. AG 링크 안정화", doctor, "150"),
      step("click", "Dr. AG 링크 클릭", doctor)
    ]),
    scenario(snapshot, "annual-volume-viewport", "연간 출하량 뷰포트 표시", [
      step("scroll_into_view", "연간 출하량 영역으로 스크롤", annual),
      step("assert_in_viewport", "연간 출하량 헤딩 표시 확인", annual)
    ]),
    scenario(snapshot, "top-scroll", "Top 버튼 최상단 복귀", [
      plainStep("scroll_to_ratio", "페이지 하단으로 스크롤", "100"),
      step("click", "Top 버튼 클릭", top, undefined, "scroll")
    ])
  ];
}

export function summarizeProductionRegression(runs: AutomatedTestRun[]): ProductionRegressionSummary {
  const successCount = runs.filter((run) => run.status === "success").length;
  const productDefectCount = runs.filter((run) => run.failureKind === "product_defect").length;
  const inconclusiveCount = runs.length - successCount - productDefectCount;
  return {
    overallStatus: productDefectCount ? "failed" : inconclusiveCount ? "passed_with_warnings" : "passed",
    totalCount: runs.length,
    successCount,
    productDefectCount,
    inconclusiveCount
  };
}

function headerLink(snapshot: PageSnapshot, name: string, pathname: string) {
  const link = snapshot.internalLinks.find((item) => item.region === "header" && item.accessibleName === name && new URL(item.href, snapshot.finalUrl).pathname === pathname);
  const element = link && snapshot.elements.find((item) => item.id === link.elementId);
  if (!element) throw new Error(`운영 회귀 대상 헤더 링크를 찾지 못했습니다: ${name}`);
  return element;
}

function elementByName(snapshot: PageSnapshot, name: string) {
  const element = snapshot.elements.find((item) => item.text === name || item.accessibleName === name);
  if (!element) throw new Error(`운영 회귀 대상 요소를 찾지 못했습니다: ${name}`);
  return element;
}

function scenario(snapshot: PageSnapshot, id: string, title: string, steps: GeneratedTestStep[]): GeneratedTestScenario {
  const orderedSteps = steps.map((item, index) => ({ ...item, order: index + 1 }));
  return {
    id: `production-regression-${id}`, analysisId: snapshot.analysisId, title, description: title, purpose: "배포 전 운영 회귀 검증",
    category: "interaction", safetyLevel: "safe", safetyReasons: ["읽기 전용 탐색"], confidence: 1, autoExecutable: true,
    sourceElementIds: orderedSteps.map((item) => item.elementId).filter((value): value is string => Boolean(value)), steps: orderedSteps,
    generatedAt: new Date().toISOString(), revision: 1, source: "user"
  };
}

function step(action: GeneratedTestStep["action"], description: string, element: PageSnapshot["elements"][number], value?: string, expected?: string): GeneratedTestStep {
  const locator = preferredLocator(element.locatorCandidates);
  return { id: `step-${action}-${element.id}`, order: 0, action, description, elementId: element.id, locator, value, expected, evidence: [`운영 회귀 요소: ${element.id}`] };
}

function plainStep(action: GeneratedTestStep["action"], description: string, value: string): GeneratedTestStep {
  return { id: `step-${action}`, order: 0, action, description, value, evidence: ["운영 회귀 고정 조건"] };
}

function preferredLocator(candidates: LocatorCandidate[]): LocatorCandidate {
  const locator = candidates.find((item) => item.strategy === "css" && item.value.includes("[href")) || candidates.find((item) => item.unique) || candidates[0];
  if (!locator) throw new Error("운영 회귀 요소의 locator를 찾지 못했습니다.");
  return locator;
}
