import type {
  ScenarioInput,
  ScenarioSummary,
  TestScenario
} from "../../shared/types/scenario.js";
import type { ProjectRepository } from "../repositories/project.repository.js";
import type { ScenarioRepository } from "../repositories/scenario.repository.js";
import type { TestRunRepository } from "../repositories/test-run.repository.js";
import type { AiFailureAnalysisRepository } from "../repositories/ai-failure-analysis.repository.js";
import type { TestRunComparisonRepository } from "../repositories/test-run-comparison.repository.js";
import { AppError } from "../utils/api.js";
import { nowIso } from "../utils/date.js";
import { createId } from "../utils/id.js";
import type { TestRunService } from "./test-run.service.js";

export class ScenarioService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly scenarioRepository: ScenarioRepository,
    private readonly testRunRepository: TestRunRepository,
    private readonly testRunService: TestRunService,
    private readonly aiFailureAnalysisRepository: AiFailureAnalysisRepository,
    private readonly testRunComparisonRepository: TestRunComparisonRepository
  ) {}

  async list(projectId: string): Promise<ScenarioSummary[]> {
    await this.requireProject(projectId);
    const scenarios = await this.scenarioRepository.listByProject(projectId);
    const runs = await this.testRunRepository.listByProject(projectId);
    return scenarios.map((scenario) => {
      const scenarioRuns = runs
        .filter((run) => run.scenarioId === scenario.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const recent = scenarioRuns[0];
      const active = scenarioRuns.find(
        (run) => run.status === "pending" || run.status === "running"
      );
      return {
        ...scenario,
        recentRunStatus: recent?.status ?? null,
        recentRunAt: recent?.createdAt ?? null,
        activeRunId: active?.id ?? null
      };
    });
  }

  async get(projectId: string, scenarioId: string): Promise<TestScenario> {
    await this.requireProject(projectId);
    const scenario = await this.scenarioRepository.findById(scenarioId);
    if (scenario === null || scenario.projectId !== projectId) {
      throw new AppError(404, "SCENARIO_NOT_FOUND", "테스트 시나리오를 찾을 수 없습니다.");
    }
    return scenario;
  }

  async create(
    projectId: string,
    input: ScenarioInput
  ): Promise<TestScenario> {
    await this.requireProject(projectId);
    const maxScenarios = positiveInteger(process.env.MAX_SCENARIOS_PER_PROJECT, 100);
    if ((await this.scenarioRepository.listByProject(projectId)).length >= maxScenarios) {
      throw new AppError(409, "SCENARIO_LIMIT_EXCEEDED", `프로젝트에는 시나리오를 최대 ${maxScenarios}개까지 등록할 수 있습니다.`);
    }
    const timestamp = nowIso();
    const scenario: TestScenario = {
      id: createId("scenario"),
      projectId,
      name: input.name,
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      startUrl: input.startUrl,
      stopOnFailure: input.stopOnFailure,
      timeout: input.timeout,
      steps: input.steps,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return this.scenarioRepository.create(scenario);
  }

  async update(
    projectId: string,
    scenarioId: string,
    input: ScenarioInput
  ): Promise<TestScenario> {
    const current = await this.get(projectId, scenarioId);
    const { description: _currentDescription, ...currentWithoutDescription } =
      current;
    const updated: TestScenario = {
      ...currentWithoutDescription,
      name: input.name,
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      startUrl: input.startUrl,
      stopOnFailure: input.stopOnFailure,
      timeout: input.timeout,
      steps: input.steps,
      updatedAt: nowIso()
    };
    const saved = await this.scenarioRepository.update(scenarioId, updated);
    if (saved === null) {
      throw new AppError(404, "SCENARIO_NOT_FOUND", "테스트 시나리오를 찾을 수 없습니다.");
    }
    return saved;
  }

  async delete(projectId: string, scenarioId: string): Promise<void> {
    await this.get(projectId, scenarioId);
    await this.testRunService.deleteByScenario(scenarioId);
    await this.aiFailureAnalysisRepository.deleteByScenario(scenarioId);
    await this.testRunComparisonRepository.deleteByScenario(scenarioId);
    await this.scenarioRepository.delete(scenarioId);
  }

  private async requireProject(projectId: string): Promise<void> {
    if ((await this.projectRepository.findById(projectId)) === null) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "테스트 프로젝트를 찾을 수 없습니다.");
    }
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
