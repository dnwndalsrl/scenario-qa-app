import type { QualityStatusSummary } from "../../../shared/types/analytics.js";
import type { AnalyticsConfig } from "./analytics-config.js";

export function determineQualityStatus(input: {
  completedRuns: number;
  successRate: number | null;
  regressionRate: number | null;
  errorRate: number | null;
}, config: AnalyticsConfig): QualityStatusSummary {
  if (input.completedRuns < config.minSampleForTrend) {
    return { state: "insufficient", reasons: ["판정에 필요한 완료 실행 표본이 부족합니다."], sampleSize: input.completedRuns };
  }
  const danger: string[] = [];
  const warning: string[] = [];
  if (input.successRate !== null && input.successRate < config.successDanger) danger.push("성공률이 위험 기준보다 낮습니다.");
  else if (input.successRate !== null && input.successRate < config.successWarning) warning.push("성공률이 주의 기준보다 낮습니다.");
  if (input.regressionRate !== null && input.regressionRate >= config.regressionDanger) danger.push("회귀율이 위험 기준 이상입니다.");
  else if (input.regressionRate !== null && input.regressionRate >= config.regressionWarning) warning.push("회귀율이 주의 기준 이상입니다.");
  if (input.errorRate !== null && input.errorRate >= config.errorDanger) danger.push("오류율이 위험 기준 이상입니다.");
  else if (input.errorRate !== null && input.errorRate >= config.errorWarning) warning.push("오류율이 주의 기준 이상입니다.");
  if (danger.length > 0) return { state: "danger", reasons: danger, sampleSize: input.completedRuns };
  if (warning.length > 0) return { state: "warning", reasons: warning, sampleSize: input.completedRuns };
  return { state: "healthy", reasons: ["핵심 품질 지표가 설정된 정상 범위입니다."], sampleSize: input.completedRuns };
}
