import type {
  ProjectInput,
  ProjectSummary,
  TestProject
} from "../../shared/types/project.js";
import type { ProjectRepository } from "../repositories/project.repository.js";
import type { AiConversionRepository } from "../repositories/ai-conversion.repository.js";
import type { AiFailureAnalysisRepository } from "../repositories/ai-failure-analysis.repository.js";
import type { ScenarioRepository } from "../repositories/scenario.repository.js";
import type { TestRunRepository } from "../repositories/test-run.repository.js";
import type { TestRunComparisonRepository } from "../repositories/test-run-comparison.repository.js";
import type { TestSuiteRepository } from "../repositories/test-suite.repository.js";
import type { TestScheduleRepository } from "../repositories/test-schedule.repository.js";
import type { TestScheduleExecutionRepository } from "../repositories/test-schedule-execution.repository.js";
import type { AppNotificationRepository } from "../repositories/app-notification.repository.js";
import type { NotificationDeliveryRepository } from "../repositories/notification-delivery.repository.js";
import { AppError } from "../utils/api.js";
import { nowIso } from "../utils/date.js";
import { createId } from "../utils/id.js";
import type { TestRunService } from "./test-run.service.js";
import type { TestSuiteRunService } from "./test-suite-run.service.js";

export class ProjectService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly scenarioRepository: ScenarioRepository,
    private readonly testRunRepository: TestRunRepository,
    private readonly testRunService: TestRunService,
    private readonly aiConversionRepository: AiConversionRepository,
    private readonly aiFailureAnalysisRepository: AiFailureAnalysisRepository,
    private readonly testRunComparisonRepository: TestRunComparisonRepository,
    private readonly testSuiteRepository: TestSuiteRepository,
    private readonly testSuiteRunService: TestSuiteRunService,
    private readonly testScheduleRepository?: TestScheduleRepository,
    private readonly testScheduleExecutionRepository?: TestScheduleExecutionRepository,
    private readonly appNotificationRepository?: AppNotificationRepository,
    private readonly notificationDeliveryRepository?: NotificationDeliveryRepository
  ) {}

  async list(): Promise<ProjectSummary[]> {
    const [projects, scenarios, runs] = await Promise.all([
      this.projectRepository.list(),
      this.scenarioRepository.list(),
      this.testRunRepository.list()
    ]);
    return projects
      .map((project) => {
        const projectRuns = runs
          .filter((run) => run.projectId === project.id)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const recent = projectRuns[0];
        return {
          ...project,
          scenarioCount: scenarios.filter(
            (scenario) => scenario.projectId === project.id
          ).length,
          recentRunStatus: recent?.status ?? null,
          recentRunAt: recent?.createdAt ?? null
        };
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(projectId: string): Promise<TestProject> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "테스트 프로젝트를 찾을 수 없습니다.");
    }
    return project;
  }

  async create(input: ProjectInput): Promise<TestProject> {
    const projects = await this.projectRepository.list();
    const maxProjects = positiveInteger(process.env.MAX_PROJECTS, 20);
    if (projects.length >= maxProjects) {
      throw new AppError(409, "PROJECT_LIMIT_EXCEEDED", `프로젝트는 최대 ${maxProjects}개까지 등록할 수 있습니다.`);
    }
    if (
      projects.some(
        (project) => project.name.toLowerCase() === input.name.toLowerCase()
      )
    ) {
      throw new AppError(409, "PROJECT_NAME_CONFLICT", "같은 이름의 프로젝트가 이미 있습니다.");
    }
    const timestamp = nowIso();
    const project: TestProject = {
      id: createId("project"),
      name: input.name,
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      baseUrl: input.baseUrl,
      environmentName: input.environmentName,
      defaultTimeout: input.defaultTimeout,
      stopOnFailure: input.stopOnFailure,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return this.projectRepository.create(project);
  }

  async update(
    projectId: string,
    input: ProjectInput
  ): Promise<TestProject> {
    const current = await this.get(projectId);
    const { description: _currentDescription, ...currentWithoutDescription } =
      current;
    const updated: TestProject = {
      ...currentWithoutDescription,
      name: input.name,
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      baseUrl: input.baseUrl,
      environmentName: input.environmentName,
      defaultTimeout: input.defaultTimeout,
      stopOnFailure: input.stopOnFailure,
      updatedAt: nowIso()
    };
    const saved = await this.projectRepository.update(projectId, updated);
    if (saved === null) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "테스트 프로젝트를 찾을 수 없습니다.");
    }
    return saved;
  }

  async delete(projectId: string): Promise<void> {
    await this.get(projectId);
    const scheduleExecutions = await this.testScheduleExecutionRepository?.deleteByProject(projectId) ?? [];
    await this.notificationDeliveryRepository?.deleteByExecutionIds(new Set(scheduleExecutions.map((item) => item.id)));
    await this.appNotificationRepository?.deleteByProject(projectId);
    await this.testScheduleRepository?.deleteByProject(projectId);
    await this.testRunService.deleteByProject(projectId);
    await this.aiConversionRepository.deleteByProject(projectId);
    await this.aiFailureAnalysisRepository.deleteByProject(projectId);
    await this.testRunComparisonRepository.deleteByProject(projectId);
    await this.testSuiteRunService.deleteByProject(projectId);
    await this.testSuiteRepository.deleteByProject(projectId);
    await this.scenarioRepository.deleteByProject(projectId);
    await this.projectRepository.delete(projectId);
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
