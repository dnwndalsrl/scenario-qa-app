import { describe, expect, it } from "vitest";
import type { GeneratedTestScenario } from "../../shared/types/analysis";
import { applyScenarioRequirementLinks, scenarioRequirementLinksSchema } from "./scenario-requirement-links.service";

const scenario = { id: "test-1", requirementIds: ["REQ-1"] } as GeneratedTestScenario;

describe("scenario requirement links", () => {
  it("replaces links with unique document requirement ids", () => {
    const input = scenarioRequirementLinksSchema.parse({ requirementIds: ["REQ-2", "REQ-2"] });
    expect(applyScenarioRequirementLinks(scenario, ["REQ-1", "REQ-2"], input.requirementIds).requirementIds).toEqual(["REQ-2"]);
  });

  it("rejects ids that are not in the analyzed document", () => {
    expect(() => applyScenarioRequirementLinks(scenario, ["REQ-1"], ["REQ-9"])).toThrow("문서에서 찾을 수 없습니다");
  });
});
