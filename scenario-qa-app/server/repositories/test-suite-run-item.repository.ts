import type { TestSuiteRunItem } from "../../shared/types/test-suite.js";
import { getStorageFile } from "../utils/file-storage.js";
import { JsonArrayRepository } from "./json-array.repository.js";

export class TestSuiteRunItemRepository extends JsonArrayRepository<TestSuiteRunItem> {
  constructor() {
    super(getStorageFile("test-suite-run-items.json"));
  }

  async listByRun(suiteRunId: string): Promise<TestSuiteRunItem[]> {
    return (await this.list())
      .filter((item) => item.suiteRunId === suiteRunId)
      .sort((left, right) => left.order - right.order);
  }

  async patch(
    itemId: string,
    changes: Partial<TestSuiteRunItem>
  ): Promise<TestSuiteRunItem | null> {
    const current = await this.findById(itemId);
    if (current === null) {
      return null;
    }
    return this.update(itemId, { ...current, ...changes, id: current.id });
  }

  async deleteByProjectRunIds(runIds: Set<string>): Promise<TestSuiteRunItem[]> {
    return this.deleteWhere((item) => runIds.has(item.suiteRunId));
  }
}
