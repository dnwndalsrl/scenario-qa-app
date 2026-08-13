import type { GeneratedTestScenario, TestSafetyLevel } from "../../../shared/types/analysis";

const BLOCKED = /삭제|탈퇴|결제|주문\s*확정|구매|환불|권한\s*변경|비밀번호\s*변경|delete|remove|payment|purchase|checkout|refund|account\s*lock/i;
const REVIEW = /로그인|검색|제출|등록|수정|저장|발송|전송|업로드|login|submit|create|update|save|send|upload/i;

export function enforceSafety(scenario: GeneratedTestScenario): GeneratedTestScenario {
  const source = [scenario.title, scenario.description, scenario.purpose, ...scenario.steps.flatMap((step) => [step.description, step.value, step.expected, step.locator?.value])].filter(Boolean).join(" ");
  const actions = new Set(scenario.steps.map((step) => step.action));
  const reasons: string[] = [];
  let level: TestSafetyLevel = scenario.safetyLevel;
  if (BLOCKED.test(source)) { level = "blocked"; reasons.push("결제·삭제·계정 변경 등 위험 키워드가 감지되었습니다."); }
  else if (REVIEW.test(source) || actions.has("press") && /enter/i.test(source)) { level = "review_required"; reasons.push("제출 또는 외부 상태 변경 가능성이 있어 사용자 검토가 필요합니다."); }
  if ([...actions].some((action) => !["goto", "scroll_to_ratio", "scroll_by", "scroll_into_view", "wait_for_stable", "assert_url", "assert_title", "assert_visible", "assert_in_viewport", "assert_enabled", "assert_text", "click", "fill", "select", "press", "check", "uncheck"].includes(action))) {
    level = "blocked"; reasons.push("지원하지 않는 동작이 포함되어 있습니다.");
  }
  const hasUnsafeClick = scenario.steps.some((step) => step.action === "click" && (BLOCKED.test(step.locator?.value || "") || REVIEW.test(step.locator?.value || "")));
  if (hasUnsafeClick) { level = BLOCKED.test(source) ? "blocked" : "review_required"; reasons.push("상태 변경 가능성이 있는 요소 클릭은 자동 실행하지 않습니다."); }
  if (level === "safe") reasons.push("조회·표시 검증 또는 읽기 전용 탐색으로 판정되었습니다.");
  return { ...scenario, safetyLevel: level, safetyReasons: [...new Set(reasons)], autoExecutable: level === "safe" && scenario.autoExecutable };
}
