import type { SuiteExecutionPolicy } from "../shared/types/test-suite";

export const SUITE_POLICY_LABELS: Record<SuiteExecutionPolicy, string> = {
  continue_on_failure: "실패해도 계속 실행",
  stop_on_failure: "실패 또는 오류 시 중단",
  stop_on_error: "오류 시에만 중단"
};

export const SUITE_POLICY_DESCRIPTIONS: Record<SuiteExecutionPolicy, string> = {
  continue_on_failure: "실패와 오류가 발생해도 남은 시나리오를 모두 실행합니다.",
  stop_on_failure: "실패 또는 오류가 발생하면 남은 시나리오를 중단합니다.",
  stop_on_error: "일반 실패는 계속 진행하고 실행 오류가 발생할 때만 중단합니다."
};
