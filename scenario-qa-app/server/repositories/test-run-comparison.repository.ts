import type { TestRunComparison } from "../../shared/types/test-run-comparison.js";
import { getStorageFile } from "../utils/file-storage.js";
import { JsonArrayRepository } from "./json-array.repository.js";

export class TestRunComparisonRepository extends JsonArrayRepository<TestRunComparison> {
  constructor() {
    super(getStorageFile("test-run-comparisons.json"));
  }

  async listByBaselineRun(runId: string): Promise<TestRunComparison[]> {
    return (await this.list()).filter((item) => item.baselineRunId === runId);
  }

  async listByComparisonRun(runId: string): Promise<TestRunComparison[]> {
    return (await this.list()).filter((item) => item.comparisonRunId === runId);
  }

  async listByRun(runId: string): Promise<TestRunComparison[]> {
    return (await this.list()).filter(
      (item) =>
        item.baselineRunId === runId || item.comparisonRunId === runId
    );
  }

  async listByScenario(
    projectId: string,
    scenarioId: string
  ): Promise<TestRunComparison[]> {
    return (await this.list()).filter(
      (item) =>
        item.projectId === projectId && item.scenarioId === scenarioId
    );
  }

  async findCombination(
    baselineRunId: string,
    comparisonRunId: string,
    algorithmVersion: string
  ): Promise<TestRunComparison | null> {
    const items = await this.list();
    return (
      items
        .filter(
          (item) =>
            item.baselineRunId === baselineRunId &&
            item.comparisonRunId === comparisonRunId &&
            item.algorithmVersion === algorithmVersion
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ??
      null
    );
  }

  async patch(
    id: string,
    changes: Partial<TestRunComparison>
  ): Promise<TestRunComparison | null> {
    const current = await this.findById(id);
    if (current === null) {
      return null;
    }
    return this.update(id, { ...current, ...changes, id: current.id });
  }

  async deleteByProject(projectId: string): Promise<TestRunComparison[]> {
    return this.deleteWhere((item) => item.projectId === projectId);
  }

  async deleteByScenario(scenarioId: string): Promise<TestRunComparison[]> {
    return this.deleteWhere((item) => item.scenarioId === scenarioId);
  }

  async deleteByRun(runId: string): Promise<TestRunComparison[]> {
    return this.deleteWhere(
      (item) =>
        item.baselineRunId === runId || item.comparisonRunId === runId
    );
  }
}
