import { validateScenarioInput } from "../../shared/schemas/scenario.schema.js";
import type { TestScenario } from "../../shared/types/scenario.js";
import type {
  TestSuite,
  TestSuiteDetail,
  TestSuiteInput,
  TestSuiteSummary
} from "../../shared/types/test-suite.js";
import type { ProjectRepository } from "../repositories/project.repository.js";
import type { ScenarioRepository } from "../repositories/scenario.repository.js";
import type { TestSuiteRepository } from "../repositories/test-suite.repository.js";
import type { TestSuiteRunRepository } from "../repositories/test-suite-run.repository.js";
import type { TestScheduleRepository } from "../repositories/test-schedule.repository.js";
import { findMissingEnvironmentVariables } from "../test-suites/utils/environment-variable-validator.js";
import {
  findDuplicateScenarioIds,
  normalizeSuiteItems
} from "../test-suites/utils/suite-item-normalizer.js";
import { AppError } from "../utils/api.js";
import { nowIso } from "../utils/date.js";
import { createId } from "../utils/id.js";

export class TestSuiteService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly scenarioRepository: ScenarioRepository,
    private readonly suiteRepository: TestSuiteRepository,
    private readonly suiteRunRepository: TestSuiteRunRepository,
    private readonly maxItems: number,
    private readonly scheduleRepository?: TestScheduleRepository
  ) {}

  async list(projectId: string): Promise<TestSuiteSummary[]> {
    await this.requireProject(projectId);
    const [suites, scenarios, runs] = await Promise.all([
      this.suiteRepository.listByProject(projectId),
      this.scenarioRepository.listByProject(projectId),
      this.suiteRunRepository.listByProject(projectId)
    ]);
    const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
    return suites
      .map((suite) => {
        const recent = runs
          .filter((run) => run.suiteId === suite.id)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        return {
          ...suite,
          executableItems: suite.items.filter((item) => item.enabled).length,
          invalidScenarioCount: suite.items.filter(
            (item) => !scenarioIds.has(item.scenarioId)
          ).length,
          recentRunStatus: recent?.status ?? null,
          recentRunAt: recent?.createdAt ?? null
        };
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(projectId: string, suiteId: string): Promise<TestSuiteDetail> {
    const suite = await this.requireSuite(projectId, suiteId);
    const [scenarios, runs] = await Promise.all([
      this.scenarioRepository.listByProject(projectId),
      this.suiteRunRepository.listBySuite(suiteId)
    ]);
    const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
    const selected = suite.items.flatMap((item) => {
      const scenario = byId.get(item.scenarioId);
      return scenario === undefined ? [] : [scenario];
    });
    return {
      suite,
      items: suite.items.map((item) => ({
        ...item,
        scenarioName: byId.get(item.scenarioId)?.name ?? null,
        scenarioExists: byId.has(item.scenarioId)
      })),
      missingScenarioIds: suite.items
        .filter((item) => !byId.has(item.scenarioId))
        .map((item) => item.scenarioId),
      missingEnvironmentVariables: findMissingEnvironmentVariables(
        selected.filter((scenario) =>
          suite.items.some(
            (item) => item.scenarioId === scenario.id && item.enabled
          )
        ),
        process.env
      ),
      recentRun:
        runs.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ??
        null
    };
  }

  async create(projectId: string, input: TestSuiteInput): Promise<TestSuite> {
    await this.requireProject(projectId);
    const maxSuites = positiveInteger(process.env.MAX_SUITES_PER_PROJECT, 30);
    if ((await this.suiteRepository.listByProject(projectId)).length >= maxSuites) {
      throw new AppError(409, "TEST_SUITE_LIMIT_EXCEEDED", `프로젝트에는 스위트를 최대 ${maxSuites}개까지 등록할 수 있습니다.`);
    }
    const items = await this.validateItems(projectId, input.items);
    const timestamp = nowIso();
    const suiteId = createId("suite");
    const suite: TestSuite = {
      id: suiteId,
      projectId,
      name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
      status: input.status,
      executionPolicy: input.executionPolicy,
      ...(input.defaultTimeout === undefined
        ? {}
        : { defaultTimeout: input.defaultTimeout }),
      items: items.map((item) => ({
        id: createId("suite-item"),
        suiteId,
        ...item,
        createdAt: timestamp,
        updatedAt: timestamp
      })),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return this.suiteRepository.create(suite);
  }

  async update(
    projectId: string,
    suiteId: string,
    input: TestSuiteInput
  ): Promise<TestSuite> {
    const current = await this.requireSuite(projectId, suiteId);
    const items = await this.validateItems(projectId, input.items);
    const timestamp = nowIso();
    const currentByScenario = new Map(
      current.items.map((item) => [item.scenarioId, item])
    );
    const updated: TestSuite = {
      id: current.id,
      projectId: current.projectId,
      name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
      status: input.status,
      executionPolicy: input.executionPolicy,
      ...(input.defaultTimeout === undefined
        ? {}
        : { defaultTimeout: input.defaultTimeout }),
      items: items.map((item) => {
        const previous = currentByScenario.get(item.scenarioId);
        return {
          id: previous?.id ?? createId("suite-item"),
          suiteId,
          ...item,
          createdAt: previous?.createdAt ?? timestamp,
          updatedAt: timestamp
        };
      }),
      createdAt: current.createdAt,
      updatedAt: timestamp
    };
    const saved = await this.suiteRepository.update(suiteId, updated);
    if (saved === null) {
      notFound();
    }
    return saved;
  }

  async delete(projectId: string, suiteId: string): Promise<void> {
    await this.requireSuite(projectId, suiteId);
    await this.scheduleRepository?.deactivateBySuite(suiteId, nowIso());
    await this.suiteRepository.delete(suiteId);
  }

  private async validateItems(
    projectId: string,
    inputItems: TestSuiteInput["items"]
  ): Promise<TestSuiteInput["items"]> {
    if (inputItems.length === 0 || inputItems.length > this.maxItems) {
      throw new AppError(
        400,
        "TEST_SUITE_EMPTY",
        `스위트에는 1~${this.maxItems}개의 시나리오가 필요합니다.`
      );
    }
    const duplicates = findDuplicateScenarioIds(inputItems);
    if (duplicates.length > 0) {
      throw new AppError(
        409,
        "TEST_SUITE_DUPLICATE_SCENARIO",
        "같은 시나리오를 한 스위트에 중복으로 추가할 수 없습니다.",
        { scenarioIds: duplicates }
      );
    }
    const items = normalizeSuiteItems(inputItems);
    const scenarios = await Promise.all(
      items.map((item) => this.scenarioRepository.findById(item.scenarioId))
    );
    scenarios.forEach((scenario, index) => {
      if (scenario === null) {
        throw new AppError(
          404,
          "TEST_SUITE_SCENARIO_NOT_FOUND",
          "스위트에 추가할 시나리오를 찾을 수 없습니다.",
          { scenarioId: items[index]?.scenarioId }
        );
      }
      if (scenario.projectId !== projectId) {
        throw new AppError(
          409,
          "TEST_SUITE_PROJECT_MISMATCH",
          "다른 프로젝트의 시나리오는 추가할 수 없습니다."
        );
      }
    });
    return items;
  }

  private async requireProject(projectId: string): Promise<void> {
    if ((await this.projectRepository.findById(projectId)) === null) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "테스트 프로젝트를 찾을 수 없습니다.");
    }
  }

  private async requireSuite(projectId: string, suiteId: string): Promise<TestSuite> {
    await this.requireProject(projectId);
    const suite = await this.suiteRepository.findById(suiteId);
    if (suite === null || suite.projectId !== projectId) {
      notFound();
    }
    return suite;
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function assertScenarioExecutable(scenario: TestScenario): void {
  const issues = validateScenarioInput({
    name: scenario.name,
    ...(scenario.description === undefined ? {} : { description: scenario.description }),
    startUrl: scenario.startUrl,
    stopOnFailure: scenario.stopOnFailure,
    timeout: scenario.timeout,
    steps: scenario.steps
  });
  if (issues.length > 0) {
    throw new AppError(
      400,
      "TEST_SUITE_VALIDATION_FAILED",
      `${scenario.name} 시나리오를 실행할 수 없습니다.`,
      { scenarioId: scenario.id, issues }
    );
  }
}

function notFound(): never {
  throw new AppError(404, "TEST_SUITE_NOT_FOUND", "테스트 스위트를 찾을 수 없습니다.");
}
