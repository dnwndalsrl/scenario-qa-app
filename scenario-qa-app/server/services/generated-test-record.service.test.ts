import { describe, expect, it } from "vitest";
import { getGeneratedTestRow } from "./generated-test-record.service";

function clientWith(result: { data: unknown; error: unknown }) {
  const query = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return result; }
  };
  return { from: () => query } as any;
}

describe("generated test record lookup", () => {
  it("finds a scenario by its analysis and source ID", async () => {
    const row = { id: "row-1", source_id: "test-1", payload: { id: "test-1" } };
    await expect(getGeneratedTestRow(clientWith({ data: row, error: null }), "analysis-1", "test-1")).resolves.toBe(row);
  });

  it("returns 404 only when the scenario does not exist", async () => {
    await expect(getGeneratedTestRow(clientWith({ data: null, error: null }), "analysis-1", "test-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("reports database failures instead of hiding them as 404", async () => {
    await expect(getGeneratedTestRow(clientWith({ data: null, error: { code: "42501" } }), "analysis-1", "test-1")).rejects.toMatchObject({
      statusCode: 500,
      data: { code: "TEST_SCENARIO_LOOKUP_FAILED" }
    });
  });
});
