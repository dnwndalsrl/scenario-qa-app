import { describe, expect, it } from "vitest";
import type { AiPageAnalysis, AutomatedTestRun, PageSnapshot } from "../../../shared/types/analysis";
import { buildSummary } from "./analysis-summary.service";

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
});
