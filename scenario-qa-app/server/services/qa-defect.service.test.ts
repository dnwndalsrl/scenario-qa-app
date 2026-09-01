import { describe, expect, it } from "vitest";
import type { AutomatedTestRun, GeneratedTestScenario } from "../../shared/types/analysis";
import { applyQaDefectUpdate, buildAutomaticQaDefectInput, buildQaDefect, qaDefectCreateSchema, qaDefectUpdateSchema } from "./qa-defect.service";

const scenario = { id: "test-1", title: "메뉴 이동 확인" } as GeneratedTestScenario;
const run = {
  id: "run-1", analysisId: "analysis-1", scenarioId: "test-1", status: "failed", stepResults: [
    { stepId: "step-1", order: 1, action: "click", description: "메뉴 클릭", status: "success" },
    { stepId: "step-2", order: 2, action: "assert_url", description: "URL 확인", status: "failed", expected: "/about", actual: "/", errorMessage: "예상 URL과 다릅니다." }
  ], consoleIssues: [], networkIssues: [], screenshotArtifactIds: ["artifact-1"], error: { code: "ASSERTION_FAILED", message: "URL 검증 실패" }
} as AutomatedTestRun;

describe("QA defect service", () => {
  it("builds a defect from server-owned failure evidence", () => {
    const defect = buildQaDefect("defect-1", run, scenario, "https://example.com", {
      runId: "run-1", title: "ABOUT 메뉴 이동 오류", description: "메뉴 이동 결과가 다릅니다.", severity: "high", priority: "P1", assignee: "홍길동", note: "재현 완료"
    }, "qa@example.com", "2026-08-27T00:00:00.000Z");
    expect(defect).toMatchObject({ id: "defect-1", sourceRunId: "run-1", scenarioId: "test-1", failureSummary: "URL 검증 실패", failedStepOrders: [2], screenshotArtifactIds: ["artifact-1"] });
    expect(defect.notes[0]).toMatchObject({ text: "재현 완료", author: "qa@example.com" });
  });

  it("records status, ownership and notes as history without replacing evidence", () => {
    const original = buildQaDefect("defect-1", run, scenario, "https://example.com", {
      runId: "run-1", title: "메뉴 이동 오류", description: "설명", severity: "high", priority: "P2", assignee: "", note: ""
    }, "qa@example.com", "2026-08-27T00:00:00.000Z");
    const updated = applyQaDefectUpdate(original, { status: "in_progress", assignee: "개발팀", note: "수정 시작" }, "dev@example.com", "2026-08-27T01:00:00.000Z");
    expect(updated).toMatchObject({ status: "in_progress", assignee: "개발팀", failureSummary: "URL 검증 실패", updatedAt: "2026-08-27T01:00:00.000Z" });
    expect(updated.notes.at(-1)?.text).toBe("수정 시작");
    expect(updated.history.at(-1)?.description).toContain("상태: 수정 중");
  });

  it("validates create and partial update inputs", () => {
    expect(qaDefectCreateSchema.safeParse({ runId: "", title: "", description: "", severity: "high", priority: "P2", assignee: "", note: "" }).success).toBe(false);
    expect(qaDefectUpdateSchema.safeParse({}).success).toBe(false);
    expect(qaDefectUpdateSchema.safeParse({ status: "resolved" }).success).toBe(true);
  });

  it("builds a conservative default when a user classifies a run as an actual defect", () => {
    expect(buildAutomaticQaDefectInput(run, scenario, "사용자 재현 완료")).toEqual({
      runId: "run-1", title: "[테스트 실패] 메뉴 이동 확인", description: "사용자 재현 완료",
      severity: "medium", priority: "P3", assignee: "", note: "사용자 재현 완료"
    });
  });
});
