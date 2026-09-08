import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { UiAuditReview, UiAuditRule } from "../shared/types/ui-audit";
import { countUiAuditReviews, uiAuditReviewStatusFor } from "../shared/utils/ui-audit-review";

const review = (rule: UiAuditRule, status: UiAuditReview["status"]): UiAuditReview => ({ rule, status, note: "", updatedAt: "2026-09-07T00:00:00Z" });
const pageSource = readFileSync(new URL("../pages/ui-audits/[auditId].vue", import.meta.url), "utf8");
const styles = readFileSync(new URL("../assets/scss/main.scss", import.meta.url), "utf8");

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

  it("keeps save feedback scoped to each remediation group", () => {
    expect(pageSource).toContain('Record<UiAuditRule, "idle" | "saving" | "success" | "error">');
    expect(pageSource).toContain('reviewFeedback[rule] = "success"');
    expect(pageSource).toContain('reviewFeedback[rule] = "error"');
    expect(pageSource).toContain('@change="clearReviewFeedback(group.rule)"');
    expect(pageSource).toContain('@input="clearReviewFeedback(group.rule)"');
  });

  it("renders accessible save progress and persistent result messages", () => {
    expect(pageSource).toContain(':disabled="reviewFeedback[group.rule] === \'saving\'"');
    expect(pageSource).toContain('"저장 중..."');
    expect(pageSource).toContain('role="status" aria-live="polite"');
    expect(pageSource).toContain('판정을 저장했습니다.');
    expect(pageSource).toContain('판정을 저장하지 못했습니다.');
    expect(pageSource).toContain('uiAuditReviewStatusFor(data.audit.reviews, group.rule) === \'fix_required\'');
    expect(styles).toContain('.ui-remediation-review__status { min-height:16px;');
  });
});
