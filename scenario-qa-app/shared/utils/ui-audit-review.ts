import type { UiAuditReview, UiAuditReviewStatus, UiAuditRule } from "../types/ui-audit";

export const UI_AUDIT_REVIEW_STATUSES: UiAuditReviewStatus[] = ["unreviewed", "fix_required", "false_positive", "deferred"];

export function uiAuditReviewStatusFor(reviews: UiAuditReview[], rule: UiAuditRule): UiAuditReviewStatus {
  return reviews.find((review) => review.rule === rule)?.status || "unreviewed";
}

export function countUiAuditReviews(rules: UiAuditRule[], reviews: UiAuditReview[]): Record<UiAuditReviewStatus, number> {
  return rules.reduce<Record<UiAuditReviewStatus, number>>((counts, rule) => {
    counts[uiAuditReviewStatusFor(reviews, rule)] += 1;
    return counts;
  }, { unreviewed: 0, fix_required: 0, false_positive: 0, deferred: 0 });
}
