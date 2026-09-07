import { describe, expect, it } from "vitest";
import type { UiAuditReview, UiAuditRule } from "../shared/types/ui-audit";
import { countUiAuditReviews, uiAuditReviewStatusFor } from "../shared/utils/ui-audit-review";

const review = (rule: UiAuditRule, status: UiAuditReview["status"]): UiAuditReview => ({ rule, status, note: "", updatedAt: "2026-09-07T00:00:00Z" });

describe("UI audit review summaries", () => {
  it("counts saved and unreviewed groups", () => {
    const rules: UiAuditRule[] = ["element_overlap", "low_contrast", "small_target", "clipped_content"];
    expect(countUiAuditReviews(rules, [review("element_overlap", "fix_required"), review("low_contrast", "false_positive"), review("small_target", "deferred")])).toEqual({
      unreviewed: 1, fix_required: 1, false_positive: 1, deferred: 1,
    });
  });

  it("defaults missing reviews to unreviewed", () => {
    expect(uiAuditReviewStatusFor([], "element_overlap")).toBe("unreviewed");
  });
});
