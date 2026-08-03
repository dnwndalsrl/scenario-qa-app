import type { TestSuite } from "../../shared/types/test-suite.js";
import { getStorageFile } from "../utils/file-storage.js";
import { JsonArrayRepository } from "./json-array.repository.js";

export class TestSuiteRepository extends JsonArrayRepository<TestSuite> {
  constructor() {
    super(getStorageFile("test-suites.json"));
  }

  async listByProject(projectId: string): Promise<TestSuite[]> {
    return (await this.list()).filter((suite) => suite.projectId === projectId);
  }

  async deleteByProject(projectId: string): Promise<TestSuite[]> {
    return this.deleteWhere((suite) => suite.projectId === projectId);
  }
}
