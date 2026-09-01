import type { AutomatedTestRun, TestRunReviewClassification } from "../types/analysis";

export interface TestRunReviewRecommendation {
  classification: TestRunReviewClassification;
  confidence: "high" | "medium" | "low";
  reason: string;
  nextAction: string;
}

const pending = (reason: string): TestRunReviewRecommendation => ({
  classification: "pending_review", confidence: "low", reason,
  nextAction: "예상 결과와 실제 화면 근거를 함께 확인한 뒤 직접 판정해 주세요."
});

export function recommendTestRunReview(run: AutomatedTestRun): TestRunReviewRecommendation {
  const kinds = new Set([run.failureKind, ...run.stepResults.map((step) => step.failureKind)].filter(Boolean));
  const evidence = [run.error?.code, run.error?.message, ...run.stepResults.flatMap((step) => [step.errorMessage, step.actual])].filter(Boolean).join(" ").toLowerCase();

  if (kinds.has("product_defect")) return {
    classification: "actual_defect", confidence: "high", reason: "실행기가 예상 결과와 실제 동작의 차이를 제품 결함으로 판정했습니다.",
    nextAction: "화면 근거를 확인하고 판정을 저장하면 결함으로 등록됩니다."
  };
  if (kinds.has("environment_error")) return {
    classification: "environment_issue", confidence: "high", reason: "브라우저·네트워크·실행기 환경에서 발생한 오류로 분류되었습니다.",
    nextAction: "사전 점검을 다시 확인한 후 동일 테스트를 재실행해 주세요."
  };
  if (/element[_ -]?not[_ -]?found|locator|selector|대상 요소|요소를 찾|not visible/.test(evidence)) return {
    classification: "element_recognition_error", confidence: "medium", reason: "대상 요소 탐색 또는 표시 확인 과정에서 실패했습니다.",
    nextAction: "실제 화면에서 요소 존재 여부를 확인하고 대상 요소 수정안을 검토해 주세요."
  };
  if (/workflow|dispatch|browser|network|timeout|timed out|실행기|네트워크|시간 초과/.test(evidence) || run.status === "error") return {
    classification: "environment_issue", confidence: "medium", reason: "실행 흐름 또는 외부 환경 오류 신호가 포함되어 있습니다.",
    nextAction: "사전 점검 후 재실행하고 같은 오류가 반복되는지 확인해 주세요."
  };
  if (kinds.has("automation_limit")) return {
    classification: "scenario_error", confidence: "medium", reason: "현재 자동화 방식으로 검증하기 어려운 단계가 포함되어 있습니다.",
    nextAction: "시나리오 단계와 예상 결과를 실제 동작에 맞게 수정해 주세요."
  };
  if (kinds.has("safety_blocked") || run.status === "blocked") return pending("안전 정책으로 실행이 차단되어 실제 제품 동작을 판정할 근거가 부족합니다.");
  if (kinds.has("inconclusive")) return pending("자동 판정만으로 제품 결함과 시나리오 오류를 구분하기 어렵습니다.");
  return pending("실패 원인이 한 가지 유형으로 충분히 확인되지 않았습니다.");
}
