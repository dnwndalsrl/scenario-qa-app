import { describe, expect, it, vi } from "vitest";
import type { TestRunComparison } from "../../../shared/types/test-run-comparison.js";
import type { TestRunComparisonRepository } from "../../repositories/test-run-comparison.repository.js";
import type { TestRunRepository } from "../../repositories/test-run.repository.js";
import type { StoredTestRun } from "../../types/storage.js";
import type { TestRunService } from "../../services/test-run.service.js";
import {
  baselineRunDetail,
  comparisonConfig,
  comparisonRunDetail,
  comparisonSteps
} from "../test-fixtures.js";
import { TestRunComparisonService } from "./test-run-comparison.service.js";

class MemoryComparisonRepository {
  items: TestRunComparison[] = [];

  async create(value: TestRunComparison): Promise<TestRunComparison> {
    this.items.push(structuredClone(value));
    return value;
  }

  async findById(id: string): Promise<TestRunComparison | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async findCombination(
    baselineRunId: string,
    comparisonRunId: string,
    algorithmVersion: string
  ): Promise<TestRunComparison | null> {
    return (
      this.items.find(
        (item) =>
          item.baselineRunId === baselineRunId &&
          item.comparisonRunId === comparisonRunId &&
          item.algorithmVersion === algorithmVersion
      ) ?? null
    );
  }

  async patch(
    id: string,
    changes: Partial<TestRunComparison>
  ): Promise<TestRunComparison | null> {
    const index = this.items.findIndex((item) => item.id === id);
    const current = this.items[index];
    if (index < 0 || current === undefined) return null;
    const updated = { ...current, ...changes, id: current.id };
    this.items[index] = updated;
    return updated;
  }

  async listByRun(runId: string): Promise<TestRunComparison[]> {
    return this.items.filter(
      (item) => item.baselineRunId === runId || item.comparisonRunId === runId
    );
  }

  async listByScenario(projectId: string, scenarioId: string): Promise<TestRunComparison[]> {
    return this.items.filter(
      (item) => item.projectId === projectId && item.scenarioId === scenarioId
    );
  }
}

describe("TestRunComparisonService", () => {
  it("pending을 즉시 만들고 완료 결과를 저장한 뒤 동일 조합을 재사용한다", async () => {
    const { service, repository } = createService();
    const accepted = await service.requestComparison({
      baselineRunId: baselineRunDetail.run.id,
      comparisonRunId: comparisonRunDetail.run.id
    });
    expect(accepted).toMatchObject({ status: "pending", reused: false });
    await expect(
      service.requestComparison({
        baselineRunId: baselineRunDetail.run.id,
        comparisonRunId: comparisonRunDetail.run.id
      })
    ).rejects.toMatchObject({ code: "RUN_COMPARISON_IN_PROGRESS" });

    await service.executeComparison(accepted.comparisonId);
    expect(repository.items[0]).toMatchObject({
      status: "completed",
      runChangeType: "regression"
    });
    const reused = await service.requestComparison({
      baselineRunId: baselineRunDetail.run.id,
      comparisonRunId: comparisonRunDetail.run.id
    });
    expect(reused).toMatchObject({
      comparisonId: accepted.comparisonId,
      status: "completed",
      reused: true
    });
  });

  it("같은 실행, 다른 시나리오, 완료되지 않은 실행을 차단한다", async () => {
    const same = createService();
    await expect(
      same.service.requestComparison({
        baselineRunId: baselineRunDetail.run.id,
        comparisonRunId: baselineRunDetail.run.id
      })
    ).rejects.toMatchObject({ code: "RUNS_MUST_BE_DIFFERENT" });

    const mismatch = createService({ comparisonScenarioId: "other-scenario" });
    await expect(
      mismatch.service.requestComparison({
        baselineRunId: baselineRunDetail.run.id,
        comparisonRunId: comparisonRunDetail.run.id
      })
    ).rejects.toMatchObject({ code: "RUNS_SCENARIO_MISMATCH" });

    const active = createService({ comparisonStatus: "running" });
    await expect(
      active.service.requestComparison({
        baselineRunId: baselineRunDetail.run.id,
        comparisonRunId: comparisonRunDetail.run.id
      })
    ).rejects.toMatchObject({ code: "RUN_NOT_COMPLETED" });
  });
});

function createService(options: {
  comparisonScenarioId?: string;
  comparisonStatus?: StoredTestRun["status"];
} = {}) {
  const baseline: StoredTestRun = {
    ...baselineRunDetail.run,
    resultFilePath: "storage/artifacts/results/baseline.json",
    artifacts: [],
    scenarioSteps: comparisonSteps
  };
  const comparison: StoredTestRun = {
    ...comparisonRunDetail.run,
    scenarioId: options.comparisonScenarioId ?? comparisonRunDetail.run.scenarioId,
    status: options.comparisonStatus ?? comparisonRunDetail.run.status,
    resultFilePath: "storage/artifacts/results/comparison.json",
    artifacts: [],
    scenarioSteps: comparisonSteps
  };
  const runs = new Map([
    [baseline.id, baseline],
    [comparison.id, comparison]
  ]);
  const repository = new MemoryComparisonRepository();
  const service = new TestRunComparisonService(
    {
      findById: vi.fn((id: string) => Promise.resolve(runs.get(id) ?? null))
    } as unknown as TestRunRepository,
    {
      getDetail: vi.fn((id: string) =>
        Promise.resolve(
          id === baseline.id ? baselineRunDetail : comparisonRunDetail
        )
      )
    } as unknown as TestRunService,
    repository as unknown as TestRunComparisonRepository,
    comparisonConfig
  );
  return { service, repository };
}
