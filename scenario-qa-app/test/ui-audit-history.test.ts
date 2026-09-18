import { describe, expect, it } from "vitest";
import type { UiAuditHistoryItem } from "../shared/types/ui-audit";
import { filterUiAuditHistory, groupUiAuditHistory } from "../shared/utils/ui-audit-history";

const items: UiAuditHistoryItem[] = [
  { id: "1", name: "완료", targetUrl: "https://example.com", normalizedUrl: "https://example.com/", status: "completed", currentMessage: "완료", hasReference: false, createdAt: "2026-09-18T03:00:00Z" },
  { id: "2", name: "실행 중", targetUrl: "https://example.com", normalizedUrl: "https://example.com/", status: "running", currentMessage: "실행 중", hasReference: true, createdAt: "2026-09-18T02:00:00Z" },
  { id: "3", name: "실패", targetUrl: "https://probe.test", normalizedUrl: "https://probe.test/", status: "failed", currentMessage: "실패", hasReference: false, createdAt: "2026-09-18T01:00:00Z" }
];

describe("UI 점검 이력", () => {
  it("URL과 상태로 필터링한다", () => {
    expect(filterUiAuditHistory(items, "EXAMPLE", "completed").map((item) => item.id)).toEqual(["1"]);
    expect(filterUiAuditHistory(items, "", "active").map((item) => item.id)).toEqual(["2"]);
    expect(filterUiAuditHistory(items, "probe", "failed").map((item) => item.id)).toEqual(["3"]);
  });

  it("정규화 URL별로 실행을 묶는다", () => {
    const groups = groupUiAuditHistory(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.audits.map((item) => item.id)).toEqual(["1", "2"]);
  });
});

