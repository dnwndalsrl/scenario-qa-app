import type { TestScenario } from "../../shared/types/scenario.js";
import { getStorageFile } from "../utils/file-storage.js";
import { JsonArrayRepository } from "./json-array.repository.js";

export class ScenarioRepository extends JsonArrayRepository<TestScenario> {
  constructor() {
    super(getStorageFile("scenarios.json"));
  }

  async listByProject(projectId: string): Promise<TestScenario[]> {
    return (await this.list()).filter(
      (scenario) => scenario.projectId === projectId
    );
  }

  async deleteByProject(projectId: string): Promise<TestScenario[]> {
    return this.deleteWhere((scenario) => scenario.projectId === projectId);
  }
}
