import { describe, expect, it } from "vitest";
import { rowToTestSuite, testSuiteInputSchema } from "./test-suite.service";

describe("test suite service", () => {
  it("trims the name and removes duplicate scenario ids", () => {
    expect(testSuiteInputSchema.parse({ name: "  회귀 테스트  ", testIds: ["test-1", "test-1", "test-2"] })).toEqual({
      name: "회귀 테스트", testIds: ["test-1", "test-2"]
    });
  });

  it("rejects an empty suite", () => {
    expect(testSuiteInputSchema.safeParse({ name: "빈 스위트", testIds: [] }).success).toBe(false);
  });

  it("maps a database row to the shared response type", () => {
    expect(rowToTestSuite({ id: "suite-1", analysis_id: "analysis-1", name: "핵심", test_ids: ["test-1"], created_at: "a", updated_at: "b" })).toEqual({
      id: "suite-1", analysisId: "analysis-1", name: "핵심", testIds: ["test-1"], createdAt: "a", updatedAt: "b"
    });
  });
});
