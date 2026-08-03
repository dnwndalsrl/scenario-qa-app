import type {
  TestRun,
  TestRunDetail,
  TestRunStatus
} from "../../shared/types/test-run.js";
import type { TestScenario } from "../../shared/types/scenario.js";
import type {
  TestSuite,
  TestSuiteRun,
  TestSuiteRunDetail,
  TestSuiteRunItem,
  TestSuiteRunItemStatus,
  TestSuiteRunRequest
} from "../../shared/types/test-suite.js";
import type { ProjectRepository } from "../repositories/project.repository.js";
import type { ScenarioRepository } from "../repositories/scenario.repository.js";
import type { TestSuiteRepository } from "../repositories/test-suite.repository.js";
import type { TestSuiteRunItemRepository } from "../repositories/test-suite-run-item.repository.js";
import type { TestSuiteRunRepository } from "../repositories/test-suite-run.repository.js";
import { findMissingEnvironmentVariables } from "../test-suites/utils/environment-variable-validator.js";
import { shouldStopSuiteExecution } from "../test-suites/utils/execution-policy.js";
import { createSuiteRunSnapshot } from "../test-suites/utils/suite-snapshot.js";
import {
  aggregateSuiteRunItems,
  determineSuiteRunStatus
} from "../test-suites/utils/suite-run-aggregator.js";
import type { TestSuiteConfig } from "../test-suites/utils/suite-config.js";
import {
  findDuplicateScenarioIds,
  normalizeSuiteItems
} from "../test-suites/utils/suite-item-normalizer.js";
import { AppError } from "../utils/api.js";
import { nowIso } from "../utils/date.js";
import { createId } from "../utils/id.js";
import { toPublicErrorMessage } from "../utils/sanitize.js";
import { assertScenarioExecutable } from "./test-suite.service.js";

export interface SuiteTestRunGateway {
  assertRunnerReady(): Promise<void>;
  requestSnapshotRun(
    projectId: string,
    scenarioSnapshot: TestScenario
  ): Promise<TestRun>;
  executeRun(runId: string): Promise<void>;
  getDetail(runId: string): Promise<TestRunDetail>;
}

const activeSuiteRunIds = new Set<string>();
const reservingSuiteIds = new Set<string>();

export class TestSuiteRunService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly scenarioRepository: ScenarioRepository,
    private readonly suiteRepository: TestSuiteRepository,
    private readonly suiteRunRepository: TestSuiteRunRepository,
    private readonly suiteRunItemRepository: TestSuiteRunItemRepository,
    private readonly testRunService: SuiteTestRunGateway,
    private readonly config: TestSuiteConfig
  ) {}

  async list(filters: {
    projectId?: string;
    suiteId?: string;
  } = {}): Promise<TestSuiteRun[]> {
    return (await this.suiteRunRepository.list())
      .filter(
        (run) =>
          (filters.projectId === undefined || run.projectId === filters.projectId) &&
          (filters.suiteId === undefined || run.suiteId === filters.suiteId)
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getDetail(suiteRunId: string): Promise<TestSuiteRunDetail> {
    const run = await this.requireRun(suiteRunId);
    return {
      run,
      items: await this.suiteRunItemRepository.listByRun(suiteRunId)
    };
  }

  async listItems(suiteRunId: string): Promise<TestSuiteRunItem[]> {
    await this.requireRun(suiteRunId);
    return this.suiteRunItemRepository.listByRun(suiteRunId);
  }

  async requestRun(request: TestSuiteRunRequest): Promise<TestSuiteRun> {
    if (reservingSuiteIds.has(request.suiteId)) {
      duplicateRun();
    }
    reservingSuiteIds.add(request.suiteId);
    try {
      const suite = await this.validateRequest(request);
      const scenarios = await Promise.all(
        suite.items.map((item) => this.scenarioRepository.findById(item.scenarioId))
      );
      const resolvedScenarios = scenarios.flatMap((scenario) =>
        scenario === null ? [] : [scenario]
      );
      const timestamp = nowIso();
      let snapshot: TestSuiteRun["suiteSnapshot"];
      try {
        snapshot = createSuiteRunSnapshot(suite, resolvedScenarios, timestamp);
      } catch {
        throw new AppError(
          500,
          "TEST_SUITE_SNAPSHOT_FAILED",
          "테스트 스위트 실행 스냅샷을 생성하지 못했습니다."
        );
      }
      const executableItems = snapshot.items.filter((item) => item.enabled).length;
      const run: TestSuiteRun = {
        id: createId("suite-run"),
        suiteId: suite.id,
        projectId: suite.projectId,
        trigger: request.trigger ?? "manual",
        ...(request.scheduleTriggerInfo === undefined
          ? {}
          : { scheduleTriggerInfo: request.scheduleTriggerInfo }),
        status: "pending",
        executionPolicy: suite.executionPolicy,
        suiteSnapshot: snapshot,
        totalItems: snapshot.items.length,
        executableItems,
        completedItems: 0,
        successCount: 0,
        failedCount: 0,
        blockedCount: 0,
        skippedCount: snapshot.items.filter((item) => !item.enabled).length,
        errorCount: 0,
        progressRate: 0,
        version: this.config.version,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      await this.suiteRunRepository.create(run);
      try {
        for (const snapshotItem of snapshot.items) {
          const item: TestSuiteRunItem = {
            id: createId("suite-run-item"),
            suiteRunId: run.id,
            suiteItemId: snapshotItem.suiteItemId,
            scenarioId: snapshotItem.scenarioId,
            scenarioName: snapshotItem.scenarioName,
            order: snapshotItem.order,
            status: snapshotItem.enabled ? "pending" : "skipped",
            required: snapshotItem.required,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          await this.suiteRunItemRepository.create(item);
        }
      } catch {
        await this.suiteRunRepository.delete(run.id);
        throw new AppError(
          500,
          "TEST_SUITE_SNAPSHOT_FAILED",
          "테스트 스위트 실행 항목을 저장하지 못했습니다."
        );
      }
      return run;
    } finally {
      reservingSuiteIds.delete(request.suiteId);
    }
  }

  async executeRun(suiteRunId: string): Promise<void> {
    if (activeSuiteRunIds.has(suiteRunId)) {
      duplicateRun();
    }
    activeSuiteRunIds.add(suiteRunId);
    const executionStartedAt = nowIso();
    try {
      const run = await this.requireRun(suiteRunId);
      await this.patchRun(run.id, {
        status: "running",
        startedAt: executionStartedAt,
        updatedAt: executionStartedAt
      });
      let stopCause: TestSuiteRunItem | null = null;
      for (const snapshotItem of run.suiteSnapshot.items) {
        if (!snapshotItem.enabled) {
          continue;
        }
        if (stopCause !== null) {
          await this.blockItem(
            run.id,
            snapshotItem.suiteItemId,
            `실행 정책(${run.executionPolicy})에 따라 이후 시나리오가 중단되었습니다.`,
            stopCause.scenarioId
          );
          await this.refreshAggregate(run.id);
          continue;
        }
        const elapsed = Date.now() - Date.parse(executionStartedAt);
        const timeout = Math.min(
          this.config.maxExecutionMs,
          run.suiteSnapshot.defaultTimeout ?? this.config.maxExecutionMs
        );
        if (elapsed > timeout) {
          const timeoutItem = await this.blockItem(
            run.id,
            snapshotItem.suiteItemId,
            "테스트 스위트 최대 실행 시간을 초과했습니다."
          );
          stopCause = timeoutItem;
          await this.refreshAggregate(run.id);
          continue;
        }
        const storedItem = await this.requireItemBySuiteItem(
          run.id,
          snapshotItem.suiteItemId
        );
        const itemStartedAt = nowIso();
        await this.patchRun(run.id, {
          currentItemOrder: snapshotItem.order,
          updatedAt: itemStartedAt
        });
        await this.patchItem(storedItem.id, {
          status: "running",
          startedAt: itemStartedAt,
          updatedAt: itemStartedAt
        });
        let completedItem: TestSuiteRunItem;
        try {
          const testRun = await this.testRunService.requestSnapshotRun(
            run.projectId,
            snapshotItem.scenarioSnapshot
          );
          await this.patchItem(storedItem.id, {
            testRunId: testRun.id,
            updatedAt: nowIso()
          });
          await this.testRunService.executeRun(testRun.id);
          const detail = await this.testRunService.getDetail(testRun.id);
          const finishedAt = nowIso();
          completedItem = await this.patchItem(storedItem.id, {
            status: mapTestRunStatus(detail.run.status),
            testRunId: testRun.id,
            finishedAt,
            durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(itemStartedAt)),
            ...(detail.run.errorMessage === undefined
              ? {}
              : { errorMessage: detail.run.errorMessage }),
            updatedAt: finishedAt
          });
        } catch (error: unknown) {
          const finishedAt = nowIso();
          completedItem = await this.patchItem(storedItem.id, {
            status: "error",
            finishedAt,
            durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(itemStartedAt)),
            errorCode:
              error instanceof AppError
                ? error.code
                : "TEST_SUITE_RUN_FAILED",
            errorMessage: toPublicErrorMessage(error),
            updatedAt: finishedAt
          });
        }
        await this.refreshAggregate(run.id);
        if (shouldStopSuiteExecution(run.executionPolicy, completedItem.status)) {
          stopCause = completedItem;
        }
      }
      const items = await this.suiteRunItemRepository.listByRun(run.id);
      const aggregate = aggregateSuiteRunItems(items, run.executableItems);
      const finishedAt = nowIso();
      await this.patchRun(run.id, {
        ...aggregate,
        status: determineSuiteRunStatus(aggregate, run.executableItems),
        finishedAt,
        durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(executionStartedAt)),
        updatedAt: finishedAt
      });
    } catch (error: unknown) {
      const finishedAt = nowIso();
      await this.patchRun(suiteRunId, {
        status: "error",
        errorCode:
          error instanceof AppError
            ? error.code
            : "TEST_SUITE_ORCHESTRATION_ERROR",
        errorMessage: toPublicErrorMessage(error),
        finishedAt,
        durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(executionStartedAt)),
        updatedAt: finishedAt
      }).catch(() => undefined);
    } finally {
      activeSuiteRunIds.delete(suiteRunId);
    }
  }

  async deleteByProject(projectId: string): Promise<void> {
    const runs = await this.suiteRunRepository.deleteByProject(projectId);
    await this.suiteRunItemRepository.deleteByProjectRunIds(
      new Set(runs.map((run) => run.id))
    );
  }

  private async validateRequest(request: TestSuiteRunRequest): Promise<TestSuite> {
    const project = await this.projectRepository.findById(request.projectId);
    if (project === null) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "테스트 프로젝트를 찾을 수 없습니다.");
    }
    const suite = await this.suiteRepository.findById(request.suiteId);
    if (suite === null) {
      throw new AppError(404, "TEST_SUITE_NOT_FOUND", "테스트 스위트를 찾을 수 없습니다.");
    }
    if (suite.projectId !== request.projectId) {
      throw new AppError(409, "TEST_SUITE_PROJECT_MISMATCH", "스위트와 프로젝트가 일치하지 않습니다.");
    }
    if (suite.status !== "active") {
      throw new AppError(409, "TEST_SUITE_INACTIVE", "비활성 스위트는 실행할 수 없습니다.");
    }
    if (suite.items.length === 0) {
      throw new AppError(400, "TEST_SUITE_EMPTY", "스위트에 시나리오가 없습니다.");
    }
    if (suite.items.length > this.config.maxItems) {
      throw new AppError(
        400,
        "TEST_SUITE_VALIDATION_FAILED",
        `스위트 항목은 최대 ${this.config.maxItems}개까지 실행할 수 있습니다.`
      );
    }
    normalizeSuiteItems(suite.items);
    if (!suite.items.some((item) => item.enabled)) {
      throw new AppError(400, "TEST_SUITE_NO_EXECUTABLE_ITEMS", "실행 가능한 시나리오가 없습니다.");
    }
    const duplicates = findDuplicateScenarioIds(suite.items);
    if (duplicates.length > 0) {
      throw new AppError(409, "TEST_SUITE_DUPLICATE_SCENARIO", "스위트에 중복 시나리오가 있습니다.", { scenarioIds: duplicates });
    }
    const active = (await this.suiteRunRepository.listBySuite(suite.id)).find(
      (run) => run.status === "pending" || run.status === "running"
    );
    if (!this.config.allowConcurrentRuns && active !== undefined) {
      duplicateRun(active.id);
    }
    const scenarios: TestScenario[] = [];
    for (const item of suite.items) {
      const scenario = await this.scenarioRepository.findById(item.scenarioId);
      if (scenario === null) {
        throw new AppError(404, "TEST_SUITE_SCENARIO_NOT_FOUND", "삭제되었거나 존재하지 않는 시나리오가 포함되어 있습니다.", { scenarioId: item.scenarioId });
      }
      if (scenario.projectId !== request.projectId) {
        throw new AppError(409, "TEST_SUITE_PROJECT_MISMATCH", "다른 프로젝트의 시나리오가 포함되어 있습니다.", { scenarioId: item.scenarioId });
      }
      assertScenarioExecutable(scenario);
      scenarios.push(scenario);
    }
    const enabledIds = new Set(suite.items.filter((item) => item.enabled).map((item) => item.scenarioId));
    const missing = findMissingEnvironmentVariables(
      scenarios.filter((scenario) => enabledIds.has(scenario.id)),
      process.env
    );
    if (missing.length > 0) {
      throw new AppError(
        400,
        "TEST_SUITE_ENV_MISSING",
        "필요한 환경변수가 없어 스위트를 실행할 수 없습니다.",
        { missingEnvironmentVariables: missing }
      );
    }
    await this.testRunService.assertRunnerReady();
    return suite;
  }

  private async refreshAggregate(runId: string): Promise<void> {
    const run = await this.requireRun(runId);
    const items = await this.suiteRunItemRepository.listByRun(runId);
    await this.patchRun(runId, {
      ...aggregateSuiteRunItems(items, run.executableItems),
      updatedAt: nowIso()
    });
  }

  private async blockItem(
    runId: string,
    suiteItemId: string,
    reason: string,
    causedByScenarioId?: string
  ): Promise<TestSuiteRunItem> {
    const item = await this.requireItemBySuiteItem(runId, suiteItemId);
    const timestamp = nowIso();
    return this.patchItem(item.id, {
      status: "blocked",
      blockedReason: reason,
      ...(causedByScenarioId === undefined ? {} : { causedByScenarioId }),
      finishedAt: timestamp,
      durationMs: 0,
      updatedAt: timestamp
    });
  }

  private async requireItemBySuiteItem(
    runId: string,
    suiteItemId: string
  ): Promise<TestSuiteRunItem> {
    const item = (await this.suiteRunItemRepository.listByRun(runId)).find(
      (candidate) => candidate.suiteItemId === suiteItemId
    );
    if (item === undefined) {
      throw new AppError(404, "TEST_SUITE_ITEM_NOT_FOUND", "스위트 실행 항목을 찾을 수 없습니다.");
    }
    return item;
  }

  private async requireRun(runId: string): Promise<TestSuiteRun> {
    const run = await this.suiteRunRepository.findById(runId);
    if (run === null) {
      throw new AppError(404, "TEST_SUITE_RUN_NOT_FOUND", "테스트 스위트 실행을 찾을 수 없습니다.");
    }
    return run;
  }

  private async patchRun(
    runId: string,
    changes: Partial<TestSuiteRun>
  ): Promise<TestSuiteRun> {
    const saved = await this.suiteRunRepository.patch(runId, changes);
    if (saved === null) {
      throw new AppError(404, "TEST_SUITE_RUN_NOT_FOUND", "테스트 스위트 실행을 찾을 수 없습니다.");
    }
    return saved;
  }

  private async patchItem(
    itemId: string,
    changes: Partial<TestSuiteRunItem>
  ): Promise<TestSuiteRunItem> {
    const saved = await this.suiteRunItemRepository.patch(itemId, changes);
    if (saved === null) {
      throw new AppError(404, "TEST_SUITE_ITEM_NOT_FOUND", "스위트 실행 항목을 찾을 수 없습니다.");
    }
    return saved;
  }
}

function mapTestRunStatus(status: TestRunStatus): TestSuiteRunItemStatus {
  if (status === "success" || status === "failed" || status === "blocked" || status === "error") {
    return status;
  }
  return "error";
}

function duplicateRun(activeRunId?: string): never {
  throw new AppError(
    409,
    "TEST_SUITE_RUN_IN_PROGRESS",
    "이 테스트 스위트는 이미 실행 중입니다.",
    activeRunId === undefined ? {} : { suiteRunId: activeRunId }
  );
}
