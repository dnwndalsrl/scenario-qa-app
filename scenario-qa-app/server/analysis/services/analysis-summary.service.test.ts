import { describe, expect, it } from "vitest";
import type { AiPageAnalysis, AutomatedTestRun, PageSnapshot } from "../../../shared/types/analysis";
import { buildCurrentSummary, buildSummary } from "./analysis-summary.service";

const snapshot = {
  elements: [], consoleMessages: [], networkIssues: []
} as unknown as PageSnapshot;
const pageAnalysis = {
  pageType: "landing", pagePurpose: "정확도 fixture", primaryFunctions: [], risks: []
} as unknown as AiPageAnalysis;

describe("analysis summary failure classification", () => {
  it("does not count an automation limitation as a product defect", () => {
    const runs = [{ status: "error", failureKind: "automation_limit" }] as AutomatedTestRun[];

    const summary = buildSummary(snapshot, pageAnalysis, [], runs);

    expect(summary).toMatchObject({ failedCount: 0, errorCount: 0, inconclusiveCount: 1, overallStatus: "passed_with_warnings" });
  });

  it("keeps assertion mismatches in the product defect count", () => {
    const runs = [{ status: "failed", failureKind: "product_defect" }] as AutomatedTestRun[];

    const summary = buildSummary(snapshot, pageAnalysis, [], runs);

    expect(summary).toMatchObject({ failedCount: 1, inconclusiveCount: 0, overallStatus: "failed" });
  });

  it("uses only the latest run per scenario for the current verdict", () => {
    const runs = [
      { id: "old", scenarioId: "test-1", status: "failed", failureKind: "product_defect", completedAt: "2026-08-18T01:00:00Z" },
      { id: "latest", scenarioId: "test-1", status: "success", completedAt: "2026-08-18T02:00:00Z" },
      { id: "other", scenarioId: "test-2", status: "success", completedAt: "2026-08-18T01:30:00Z" }
    ] as AutomatedTestRun[];

    const summary = buildCurrentSummary(snapshot, pageAnalysis, [], runs);

    expect(summary).toMatchObject({ executedTestCount: 2, successCount: 2, failedCount: 0, overallStatus: "passed" });
  });
});
