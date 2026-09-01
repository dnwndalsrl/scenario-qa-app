import { z } from "zod";
import type { AutomatedTestRun } from "../../shared/types/analysis";
import { AppError } from "../../shared/errors";

export const testRunReviewSchema = z.object({
  classification: z.enum(["actual_defect", "scenario_error", "element_recognition_error", "environment_issue", "requirement_change", "pending_review"]),
  note: z.string().trim().max(1000).optional().default("")
});

export type TestRunReviewInput = z.infer<typeof testRunReviewSchema>;

export function applyTestRunReview(run: AutomatedTestRun, input: TestRunReviewInput, reviewedAt = new Date().toISOString(), defectId?: string): AutomatedTestRun {
  if (!new Set(["failed", "error", "blocked"]).has(run.status)) {
    throw new AppError("FAILED_RUN_REQUIRED", "실패하거나 확인이 필요한 실행 결과만 판정할 수 있습니다.", 409);
  }
  return {
    ...run,
    review: {
      classification: input.classification,
      note: input.note || undefined,
      reviewedAt,
      defectId: defectId || run.review?.defectId
    }
  };
}
