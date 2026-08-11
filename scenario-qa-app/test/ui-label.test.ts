import { describe, expect, it } from "vitest";
import { uiLabel } from "../utils/ui-label";

describe("UI 상태 한글 표시", () => {
  it.each([
    ["safe", "안전"],
    ["review_required", "검토 필요"],
    ["suitable", "요구사항 적합"],
    ["unsuitable", "요구사항 부족"],
    ["blocked", "차단"],
    ["success", "성공"],
    ["failed", "실패"],
    ["passed_with_warnings", "경고 포함 통과"],
    ["partially_completed", "부분 완료"],
    ["page_load", "페이지 로드"],
    ["visibility", "표시 확인"],
    ["landing", "랜딩 페이지"]
  ])("%s를 %s로 표시한다", (status, expected) => expect(uiLabel(status)).toBe(expected));

  it("알 수 없는 값은 그대로 표시한다", () => expect(uiLabel("custom_status")).toBe("custom_status"));
});
