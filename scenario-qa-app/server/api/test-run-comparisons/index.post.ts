import type { TestRunComparisonRequest } from "../../../shared/types/test-run-comparison.js";
import { testRunComparisonService } from "../../services/container.js";
import { AppError, defineApiHandler, readBodyObject } from "../../utils/api.js";

export default defineApiHandler(async (event) => {
  const body = await readBodyObject(event);
  if (
    typeof body.baselineRunId !== "string" ||
    body.baselineRunId.trim().length === 0 ||
    typeof body.comparisonRunId !== "string" ||
    body.comparisonRunId.trim().length === 0
  ) {
    throw new AppError(
      400,
      "RUN_COMPARISON_REQUEST_INVALID",
      "기준 실행과 비교 실행 ID가 필요합니다."
    );
  }
  const request: TestRunComparisonRequest = {
    baselineRunId: body.baselineRunId,
    comparisonRunId: body.comparisonRunId
  };
  const accepted = await testRunComparisonService.requestComparison(request);
  if (!accepted.reused) {
    setTimeout(() => {
      void testRunComparisonService.executeComparison(accepted.comparisonId);
    }, 0);
  }
  return accepted;
});
