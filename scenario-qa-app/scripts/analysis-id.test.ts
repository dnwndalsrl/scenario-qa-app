import { describe, expect, it } from "vitest";
import { analysisIdFromArgs } from "./analysis-id";
describe("analysisIdFromArgs", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  it("supports equals syntax", () => expect(analysisIdFromArgs([`--analysis-id=${id}`])).toBe(id));
  it("supports separate syntax", () => expect(analysisIdFromArgs(["--analysis-id", id])).toBe(id));
  it("rejects missing and unsafe values", () => { expect(() => analysisIdFromArgs([])).toThrow(); expect(() => analysisIdFromArgs(["--analysis-id=hello"])).toThrow(); });
});
