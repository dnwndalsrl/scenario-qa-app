import { describe, expect, it } from "vitest";
import type { GeneratedTestScenario } from "../../../shared/types/analysis";
import { enforceSafety } from "./test-safety.service";

function scenario(title: string, action: GeneratedTestScenario["steps"][number]["action"] = "assert_visible"): GeneratedTestScenario {
  return { id: "test-1", analysisId: "analysis-1", title, description: title, purpose: title, category: "visibility", safetyLevel: "safe", safetyReasons: [], confidence: .9, autoExecutable: true, sourceElementIds: ["element-1"], steps: [{ id: "step-1", order: 1, action, description: title, elementId: "element-1", locator: { strategy: "test_id", value: title, score: 100, unique: true }, evidence: ["element-1"] }], generatedAt: new Date().toISOString() };
}
describe("코드 기반 테스트 안전성", () => {
  it("읽기 전용 검증과 단순 navigation은 safe다", () => { expect(enforceSafety(scenario("제목 표시 확인")).safetyLevel).toBe("safe"); expect(enforceSafety(scenario("메뉴 열기", "click")).safetyLevel).toBe("safe"); });
  it.each([["저장 및 제출", "review_required"], ["계정 삭제", "blocked"], ["결제하기", "blocked"]] as const)("%s를 %s로 재분류한다", (title, expected) => expect(enforceSafety(scenario(title, "click")).safetyLevel).toBe(expected));
  it("AI가 safe라고 해도 위험 정책을 우선한다", () => { const result = enforceSafety(scenario("delete account", "click")); expect(result.safetyLevel).toBe("blocked"); expect(result.autoExecutable).toBe(false); });
});
