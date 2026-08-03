import path from "node:path";
import type { ScenarioResult as EngineScenarioResult } from "scenario-test-runner";
import type {
  RunResult,
  TestRun,
  TestRunDetail,
  TestRunRequest
} from "../../shared/types/test-run.js";
import type { TestScenario } from "../../shared/types/scenario.js";
import type { ProjectRepository } from "../repositories/project.repository.js";
import type { ScenarioRepository } from "../repositories/scenario.repository.js";
import type { TestRunRepository } from "../repositories/test-run.repository.js";
import { executeScenarioWithPlaywright } from "../runners/scenario-runner.js";
import type {
  StoredArtifact,
  StoredTestRun
} from "../types/storage.js";
import { AppError } from "../utils/api.js";
import { nowIso } from "../utils/date.js";
import {
  assertPathInside,
  fileExists,
  getStorageRoot,
  readJsonObject,
  removeAppRelativeFile,
  resolveAppRelativePath
} from "../utils/file-storage.js";
import { createId } from "../utils/id.js";
import { toPublicErrorMessage } from "../utils/sanitize.js";
import { operationalLog } from "../utils/operational-logger.js";

let activeRunId: string | null = null;

export class TestRunService {
  private acceptingRuns = true;

  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly scenarioRepository: ScenarioRepository,
    private readonly testRunRepository: TestRunRepository
  ) {}

  async list(filters: {
    projectId?: string;
    scenarioId?: string;
  } = {}): Promise<TestRun[]> {
    const runs = await this.testRunRepository.list();
    return runs
      .filter(
        (run) =>
          (filters.projectId === undefined ||
            run.projectId === filters.projectId) &&
          (filters.scenarioId === undefined ||
            run.scenarioId === filters.scenarioId)
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(toPublicRun);
  }

  async getDetail(runId: string): Promise<TestRunDetail> {
    const storedRun = await this.requireStoredRun(runId);
    return {
      run: toPublicRun(storedRun),
      result: await this.readPublicResult(storedRun)
    };
  }

  async requestRun(request: TestRunRequest): Promise<TestRun> {
    this.assertAcceptingRuns();
    const project = await this.projectRepository.findById(request.projectId);
    if (project === null) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "테스트 프로젝트를 찾을 수 없습니다.");
    }
    const scenario = await this.scenarioRepository.findById(request.scenarioId);
    if (scenario === null || scenario.projectId !== request.projectId) {
      throw new AppError(404, "SCENARIO_NOT_FOUND", "테스트 시나리오를 찾을 수 없습니다.");
    }
    await this.assertRunnerAvailable(request.scenarioId);
    return this.createStoredRun(request.projectId, scenario);
  }

  async requestSnapshotRun(
    projectId: string,
    scenarioSnapshot: TestScenario
  ): Promise<TestRun> {
    this.assertAcceptingRuns();
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "테스트 프로젝트를 찾을 수 없습니다.");
    }
    if (scenarioSnapshot.projectId !== projectId) {
      throw new AppError(
        409,
        "TEST_SUITE_PROJECT_MISMATCH",
        "스냅샷 시나리오와 프로젝트가 일치하지 않습니다."
      );
    }
    await this.assertRunnerAvailable(scenarioSnapshot.id);
    return this.createStoredRun(projectId, structuredClone(scenarioSnapshot));
  }

  async assertRunnerReady(): Promise<void> {
    this.assertAcceptingRuns();
    const activeRuns = (await this.testRunRepository.list()).filter(
      (run) => run.status === "pending" || run.status === "running"
    );
    if (activeRunId !== null || activeRuns.length > 0) {
      throw new AppError(
        409,
        "TEST_SUITE_RUN_BLOCKED",
        "다른 개별 테스트가 실행 중입니다. 완료된 뒤 스위트를 실행해 주세요."
      );
    }
  }

  beginShutdown(): void {
    this.acceptingRuns = false;
  }

  isAcceptingRuns(): boolean {
    return this.acceptingRuns;
  }

  async isBusy(): Promise<boolean> {
    if (activeRunId !== null) return true;
    return (await this.testRunRepository.list()).some(
      (run) => run.status === "pending" || run.status === "running"
    );
  }

  async waitForIdle(timeoutMs = 25_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (await this.isBusy()) {
      if (Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return true;
  }

  private async createStoredRun(
    projectId: string,
    scenario: TestScenario
  ): Promise<TestRun> {
    const createdAt = nowIso();
    const storedRun: StoredTestRun = {
      id: createId("run"),
      projectId,
      scenarioId: scenario.id,
      status: "pending",
      totalSteps: scenario.steps.length,
      successCount: 0,
      failedCount: 0,
      blockedCount: 0,
      errorCount: 0,
      scenarioUpdatedAt: scenario.updatedAt,
      createdAt,
      artifacts: [],
      scenarioSnapshot: structuredClone(scenario),
      scenarioSteps: scenario.steps.map((step) => ({
        ...step,
        ...(step.target === undefined ? {} : { target: { ...step.target } }),
        ...(step.expected === undefined
          ? {}
          : { expected: { ...step.expected } })
      }))
    };
    await this.testRunRepository.create(storedRun);
    return toPublicRun(storedRun);
  }

  async executeRun(runId: string): Promise<void> {
    let ownsRunnerLock = false;
    if (activeRunId !== null && activeRunId !== runId) {
      throw new AppError(409, "RUNNER_BUSY", "다른 테스트가 실행 중입니다.");
    }
    activeRunId = runId;
    ownsRunnerLock = true;
    const startedAt = nowIso();
    try {
      const run = await this.requireStoredRun(runId);
      const project = await this.projectRepository.findById(run.projectId);
      const currentScenario =
        run.scenarioSnapshot === undefined
          ? await this.scenarioRepository.findById(run.scenarioId)
          : null;
      const scenario = run.scenarioSnapshot ?? currentScenario;
      if (
        project === null ||
        scenario === null ||
        scenario.projectId !== run.projectId
      ) {
        throw new AppError(
          404,
          "RUN_RESOURCE_NOT_FOUND",
          "실행할 프로젝트 또는 시나리오를 찾을 수 없습니다."
        );
      }

      await this.updateStoredRun(runId, {
        status: "running",
        startedAt
      });
      const output = await executeScenarioWithPlaywright(project, scenario);
      const artifacts = output.result.steps.flatMap<StoredArtifact>((step) =>
        step.screenshotPath === null
          ? []
          : [
              {
                id: createId("artifact"),
                runId,
                stepId: step.stepId,
                type: "screenshot",
                relativePath: step.screenshotPath
              }
            ]
      );
      // Keep the persisted running state authoritative until the in-memory lock
      // is released. This prevents a fast poller from starting the next run in
      // the short interval between publishing a terminal state and `finally`.
      if (ownsRunnerLock && activeRunId === runId) activeRunId = null;
      await this.updateStoredRun(runId, {
        status: output.result.status,
        startedAt: output.result.startedAt,
        finishedAt: output.result.finishedAt,
        durationMs: output.result.durationMs,
        totalSteps: output.result.totalSteps,
        successCount: output.result.successCount,
        failedCount: output.result.failedCount,
        blockedCount: output.result.blockedCount,
        errorCount: output.result.errorCount,
        resultFilePath: output.resultPath,
        artifacts
      });
    } catch (error: unknown) {
      const finishedAt = nowIso();
      const startedMs = Date.parse(startedAt);
      const errorCode = classifyExecutionError(error);
      operationalLog("error", "test_run_failed", { runId, errorCode, message: error instanceof Error ? error.message : String(error) });
      if (ownsRunnerLock && activeRunId === runId) activeRunId = null;
      await this.updateStoredRun(runId, {
        status: "error",
        startedAt,
        finishedAt,
        durationMs: Math.max(0, Date.parse(finishedAt) - startedMs),
        errorCount: 1,
        errorCode,
        errorMessage: toPublicErrorMessage(error)
      }).catch(() => undefined);
    } finally {
      if (ownsRunnerLock && activeRunId === runId) activeRunId = null;
    }
  }

  async retry(runId: string): Promise<TestRun> {
    const original = await this.requireStoredRun(runId);
    if (original.status === "pending" || original.status === "running") {
      throw new AppError(409, "RUN_NOT_FINISHED", "실행 중인 테스트는 다시 실행할 수 없습니다.");
    }
    return original.scenarioSnapshot === undefined
      ? this.requestRun({
          projectId: original.projectId,
          scenarioId: original.scenarioId
        })
      : this.requestSnapshotRun(
          original.projectId,
          structuredClone(original.scenarioSnapshot)
        );
  }

  async getScreenshotArtifact(
    runId: string,
    artifactId: string
  ): Promise<string> {
    const run = await this.requireStoredRun(runId);
    const artifact = run.artifacts.find(
      (candidate) =>
        candidate.id === artifactId &&
        candidate.runId === runId &&
        candidate.type === "screenshot"
    );
    if (artifact === undefined) {
      throw new AppError(404, "ARTIFACT_NOT_FOUND", "스크린샷을 찾을 수 없습니다.");
    }
    const absolutePath = resolveAppRelativePath(artifact.relativePath);
    const artifactsRoot = path.join(getStorageRoot(), "artifacts");
    assertPathInside(artifactsRoot, absolutePath);
    if (path.extname(absolutePath).toLowerCase() !== ".png") {
      throw new AppError(400, "INVALID_ARTIFACT_TYPE", "PNG 이미지만 조회할 수 있습니다.");
    }
    if (!(await fileExists(absolutePath))) {
      throw new AppError(404, "ARTIFACT_FILE_NOT_FOUND", "스크린샷 파일이 없습니다.");
    }
    return absolutePath;
  }

  async deleteByProject(projectId: string): Promise<void> {
    const runs = await this.testRunRepository.deleteByProject(projectId);
    await Promise.all(runs.map((run) => this.removeRunFiles(run)));
  }

  async deleteByScenario(scenarioId: string): Promise<void> {
    const runs = await this.testRunRepository.deleteByScenario(scenarioId);
    await Promise.all(runs.map((run) => this.removeRunFiles(run)));
  }

  private async requireStoredRun(runId: string): Promise<StoredTestRun> {
    const run = await this.testRunRepository.findById(runId);
    if (run === null) {
      throw new AppError(404, "TEST_RUN_NOT_FOUND", "테스트 실행 정보를 찾을 수 없습니다.");
    }
    return run;
  }

  private async assertRunnerAvailable(scenarioId: string): Promise<void> {
    this.assertAcceptingRuns();
    const activeRuns = (await this.testRunRepository.list()).filter(
      (run) => run.status === "pending" || run.status === "running"
    );
    if (
      activeRunId !== null ||
      activeRuns.some((run) => run.scenarioId === scenarioId)
    ) {
      throw new AppError(
        409,
        "RUN_ALREADY_ACTIVE",
        "이 시나리오는 이미 실행 중입니다. 현재 실행이 끝난 뒤 다시 시도해 주세요."
      );
    }
    if (activeRuns.length > 0) {
      throw new AppError(
        409,
        "RUNNER_BUSY",
        "다른 테스트가 실행 중입니다. 완료된 뒤 다시 시도해 주세요."
      );
    }
  }

  private assertAcceptingRuns(): void {
    if (!this.acceptingRuns) {
      throw new AppError(
        503,
        "SERVER_SHUTTING_DOWN",
        "서버가 안전하게 종료되는 중입니다. 잠시 후 다시 시도해 주세요."
      );
    }
  }

  private async updateStoredRun(
    runId: string,
    changes: Partial<StoredTestRun>
  ): Promise<StoredTestRun> {
    const current = await this.requireStoredRun(runId);
    const updated: StoredTestRun = { ...current, ...changes, id: current.id };
    const saved = await this.testRunRepository.update(runId, updated);
    if (saved === null) {
      throw new AppError(404, "TEST_RUN_NOT_FOUND", "테스트 실행 정보를 찾을 수 없습니다.");
    }
    return saved;
  }

  private async readPublicResult(
    run: StoredTestRun
  ): Promise<RunResult | null> {
    if (run.resultFilePath === undefined) {
      return null;
    }
    const resultPath = resolveAppRelativePath(run.resultFilePath);
    assertPathInside(path.join(getStorageRoot(), "artifacts"), resultPath);
    if (!(await fileExists(resultPath))) {
      return null;
    }
    const raw = await readJsonObject<EngineScenarioResult>(resultPath);
    const artifactsByStep = new Map(
      run.artifacts.map((artifact) => [artifact.stepId, artifact.id])
    );
    return {
      scenarioId: raw.scenarioId,
      scenarioName: raw.scenarioName,
      status: raw.status,
      startedAt: raw.startedAt,
      finishedAt: raw.finishedAt,
      durationMs: raw.durationMs,
      totalSteps: raw.totalSteps,
      successCount: raw.successCount,
      failedCount: raw.failedCount,
      blockedCount: raw.blockedCount,
      errorCount: raw.errorCount,
      steps: raw.steps.map((step) => ({
        stepId: step.stepId,
        stepName: step.stepName,
        action: step.action,
        status: step.status,
        startedAt: step.startedAt,
        finishedAt: step.finishedAt,
        durationMs: step.durationMs,
        expected: step.expected,
        actual: step.actual,
        errorMessage: step.errorMessage,
        screenshotArtifactId: artifactsByStep.get(step.stepId) ?? null,
        currentUrl: step.currentUrl
      })),
      consoleLogs: raw.consoleLogs,
      networkErrors: raw.networkErrors,
      ...(raw.browserInfo === undefined ? {} : { browserInfo: raw.browserInfo })
    };
  }

  private async removeRunFiles(run: StoredTestRun): Promise<void> {
    const artifactsRoot = path.join(getStorageRoot(), "artifacts");
    const paths = [
      ...(run.resultFilePath === undefined ? [] : [run.resultFilePath]),
      ...run.artifacts.map((artifact) => artifact.relativePath)
    ];
    await Promise.all(
      paths.map((relativePath) =>
        removeAppRelativeFile(relativePath, artifactsRoot).catch(() => undefined)
      )
    );
  }
}

function toPublicRun(run: StoredTestRun): TestRun {
  return {
    id: run.id,
    projectId: run.projectId,
    scenarioId: run.scenarioId,
    status: run.status,
    ...(run.startedAt === undefined ? {} : { startedAt: run.startedAt }),
    ...(run.finishedAt === undefined ? {} : { finishedAt: run.finishedAt }),
    ...(run.durationMs === undefined ? {} : { durationMs: run.durationMs }),
    totalSteps: run.totalSteps,
    successCount: run.successCount,
    failedCount: run.failedCount,
    blockedCount: run.blockedCount,
    errorCount: run.errorCount,
    ...(run.errorCode === undefined ? {} : { errorCode: run.errorCode }),
    ...(run.errorMessage === undefined
      ? {}
      : { errorMessage: run.errorMessage }),
    ...(run.scenarioUpdatedAt === undefined
      ? {}
      : { scenarioUpdatedAt: run.scenarioUpdatedAt }),
    createdAt: run.createdAt
  };
}

function classifyExecutionError(error: unknown): string {
  if (error instanceof AppError) return error.code;
  if (!(error instanceof Error)) return "TEST_RUN_EXECUTION_ERROR";
  if (error.name === "MissingEnvironmentVariablesError") {
    return "MISSING_ENVIRONMENT_VARIABLES";
  }
  if (error.name === "ScenarioValidationError") return "INVALID_SCENARIO";
  const message = error.message.toLowerCase();
  if (
    message.includes("executable doesn't exist") ||
    message.includes("browser was not found")
  ) {
    return "PLAYWRIGHT_BROWSER_NOT_INSTALLED";
  }
  if (
    message.includes("browsertype.launch") ||
    message.includes("target page, context or browser has been closed")
  ) {
    return "PLAYWRIGHT_BROWSER_LAUNCH_FAILED";
  }
  if (message.includes("unsafe") || message.includes("ssrf")) {
    return "UNSAFE_TARGET_URL";
  }
  if (
    message.includes("eperm") ||
    message.includes("ebusy") ||
    message.includes("eacces")
  ) {
    return "STORAGE_ATOMIC_WRITE_FAILED";
  }
  return "TEST_RUN_EXECUTION_ERROR";
}
