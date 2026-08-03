import type { TestSuiteRun } from "../../shared/types/test-suite.js";
import { getStorageFile } from "../utils/file-storage.js";
import { JsonArrayRepository } from "./json-array.repository.js";

export class TestSuiteRunRepository extends JsonArrayRepository<TestSuiteRun> {
  constructor() {
    super(getStorageFile("test-suite-runs.json"));
  }

  async listByProject(projectId: string): Promise<TestSuiteRun[]> {
    return (await this.list()).filter((run) => run.projectId === projectId);
  }

  async listBySuite(suiteId: string): Promise<TestSuiteRun[]> {
    return (await this.list()).filter((run) => run.suiteId === suiteId);
  }

  async patch(
    runId: string,
    changes: Partial<TestSuiteRun>
  ): Promise<TestSuiteRun | null> {
    const current = await this.findById(runId);
    if (current === null) {
      return null;
    }
    return this.update(runId, { ...current, ...changes, id: current.id });
  }

  async deleteByProject(projectId: string): Promise<TestSuiteRun[]> {
    return this.deleteWhere((run) => run.projectId === projectId);
  }
}
