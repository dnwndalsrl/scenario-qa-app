import type { StoredTestRun } from "../types/storage.js";
import { getStorageFile } from "../utils/file-storage.js";
import { JsonArrayRepository } from "./json-array.repository.js";

export class TestRunRepository extends JsonArrayRepository<StoredTestRun> {
  constructor() {
    super(getStorageFile("test-runs.json"));
  }

  async listByProject(projectId: string): Promise<StoredTestRun[]> {
    return (await this.list()).filter((run) => run.projectId === projectId);
  }

  async listByScenario(scenarioId: string): Promise<StoredTestRun[]> {
    return (await this.list()).filter((run) => run.scenarioId === scenarioId);
  }

  async deleteByProject(projectId: string): Promise<StoredTestRun[]> {
    return this.deleteWhere((run) => run.projectId === projectId);
  }

  async deleteByScenario(scenarioId: string): Promise<StoredTestRun[]> {
    return this.deleteWhere((run) => run.scenarioId === scenarioId);
  }
}
