import { describe, expect, it } from "vitest";
import type { UiAuditIssue } from "../../shared/types/ui-audit";
import { groupUiAuditIssues, UI_AUDIT_RULE_GUIDANCE } from "../../shared/utils/ui-audit-remediation";

const issue = (overrides: Partial<UiAuditIssue>): UiAuditIssue => ({
  id: "issue-1",
  rule: "clipped_content",
  severity: "medium",
  title: "콘텐츠가 잘립니다.",
  message: "표시 영역보다 내용이 큽니다.",
  selector: ".card",
  state: "initial",
  actual: {},
  ...overrides,
});

describe("groupUiAuditIssues", () => {
  it("같은 규칙의 문제를 하나의 수정 단위로 묶고 영향 범위를 계산한다", () => {
    const groups = groupUiAuditIssues([
      issue({ id: "issue-1", selector: ".card", state: "initial" }),
      issue({ id: "issue-2", selector: ".card", state: "scroll_50" }),
      issue({ id: "issue-3", selector: ".panel", state: "scroll_50" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ rule: "clipped_content", affectedCount: 2, stateCount: 2 });
    expect(groups[0]!.issues).toHaveLength(3);
  });

  it("높은 심각도의 수정 단위를 먼저 보여준다", () => {
    const groups = groupUiAuditIssues([
      issue({ id: "low", rule: "small_target", severity: "low" }),
      issue({ id: "high", rule: "element_overlap", severity: "high" }),
      issue({ id: "medium", rule: "low_contrast", severity: "medium" }),
    ]);

    expect(groups.map((group) => group.severity)).toEqual(["high", "medium", "low"]);
  });

  it("모든 자동 점검 규칙에 조치 가능한 안내를 제공한다", () => {
    expect(Object.values(UI_AUDIT_RULE_GUIDANCE)).toHaveLength(5);
    expect(UI_AUDIT_RULE_GUIDANCE.low_contrast.recommendation).toContain("텍스트");
    expect(UI_AUDIT_RULE_GUIDANCE.small_target.standard).toContain("24×24px");
  });
});
