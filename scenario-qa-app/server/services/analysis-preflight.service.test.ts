import { describe, expect, it, vi } from "vitest";
import type { PreflightCheck } from "../../shared/types/preflight";
import { buildAnalysisPreflight, inspectTargetReachability } from "./analysis-preflight.service";

const targetReady: PreflightCheck = { id: "target", label: "대상 페이지", status: "ready", message: "정상" };

describe("analysis preflight", () => {
  it("모든 필수 조건이 충족되면 실행 가능으로 판정한다", () => {
    const result = buildAnalysisPreflight({ target: targetReady, snapshotCount: 1, totalScenarioCount: 2, readyScenarioCount: 2, activeRunCount: 0, runnerConfigured: true, runnerReachable: true, runnerActive: true }, new Date("2026-08-31T00:00:00Z"));
    expect(result).toMatchObject({ status: "ready", canRun: true, readyScenarioCount: 2, excludedScenarioCount: 0, checkedAt: "2026-08-31T00:00:00.000Z" });
  });

  it("실행 가능한 시나리오나 실행기가 없으면 실행을 차단한다", () => {
    const result = buildAnalysisPreflight({ target: targetReady, snapshotCount: 1, totalScenarioCount: 1, readyScenarioCount: 0, activeRunCount: 0, runnerConfigured: false, runnerReachable: false, runnerActive: false });
    expect(result.canRun).toBe(false);
    expect(result.checks.filter((check) => check.status === "blocked").map((check) => check.id)).toEqual(["scenarios", "runner"]);
  });

  it("일부 시나리오 제외와 대상 접근 제한은 경고하되 실행을 허용한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    const target = await inspectTargetReachability("https://example.com", fetcher);
    const result = buildAnalysisPreflight({ target, snapshotCount: 1, totalScenarioCount: 3, readyScenarioCount: 2, activeRunCount: 0, runnerConfigured: true, runnerReachable: true, runnerActive: true });
    expect(target.status).toBe("warning");
    expect(result).toMatchObject({ status: "warning", canRun: true, excludedScenarioCount: 1 });
  });
});
