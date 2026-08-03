import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestProject } from "../../shared/types/project.js";
import type { TestScenario } from "../../shared/types/scenario.js";
import type {
  TestRun,
  TestRunDetail,
  TestRunStatus
} from "../../shared/types/test-run.js";
import type { TestSuiteInput } from "../../shared/types/test-suite.js";
import { ProjectRepository } from "../repositories/project.repository.js";
import { ScenarioRepository } from "../repositories/scenario.repository.js";
import { TestSuiteRepository } from "../repositories/test-suite.repository.js";
import { TestSuiteRunItemRepository } from "../repositories/test-suite-run-item.repository.js";
import { TestSuiteRunRepository } from "../repositories/test-suite-run.repository.js";
import type { SuiteTestRunGateway } from "./test-suite-run.service.js";
import { TestSuiteRunService } from "./test-suite-run.service.js";
import { TestSuiteService } from "./test-suite.service.js";

class FakeTestRunGateway implements SuiteTestRunGateway {
  readonly requestedScenarioIds: string[] = [];
  readonly runs = new Map<string, TestRun>();
  statuses: Record<string, TestRunStatus> = {};

  async assertRunnerReady(): Promise<void> {}

  async requestSnapshotRun(
    projectId: string,
    scenarioSnapshot: TestScenario
  ): Promise<TestRun> {
    this.requestedScenarioIds.push(scenarioSnapshot.id);
    const id = `test-run-${this.requestedScenarioIds.length}`;
    const run: TestRun = {
      id,
      projectId,
      scenarioId: scenarioSnapshot.id,
      status: this.statuses[scenarioSnapshot.id] ?? "success",
      totalSteps: scenarioSnapshot.steps.length,
      successCount: 1,
      failedCount: 0,
      blockedCount: 0,
      errorCount: 0,
      createdAt: "2026-08-03T00:00:00.000Z"
    };
    this.runs.set(id, run);
    return run;
  }

  async executeRun(): Promise<void> {}

  async getDetail(runId: string): Promise<TestRunDetail> {
    const run = this.runs.get(runId);
    if (run === undefined) throw new Error("missing fake run");
    return { run, result: null };
  }
}

describe.sequential("TestSuiteRunService integration", () => {
  let storageRoot = "";
  let projectRepository: ProjectRepository;
  let scenarioRepository: ScenarioRepository;
  let suiteRepository: TestSuiteRepository;
  let suiteRunRepository: TestSuiteRunRepository;
  let itemRepository: TestSuiteRunItemRepository;
  let suiteService: TestSuiteService;
  let runService: TestSuiteRunService;
  let gateway: FakeTestRunGateway;

  beforeEach(async () => {
    storageRoot = await mkdtemp(path.join(tmpdir(), "suite-service-"));
    process.env.NUXT_STORAGE_ROOT = storageRoot;
    projectRepository = new ProjectRepository();
    scenarioRepository = new ScenarioRepository();
    suiteRepository = new TestSuiteRepository();
    suiteRunRepository = new TestSuiteRunRepository();
    itemRepository = new TestSuiteRunItemRepository();
    gateway = new FakeTestRunGateway();
    suiteService = new TestSuiteService(
      projectRepository,
      scenarioRepository,
      suiteRepository,
      suiteRunRepository,
      50
    );
    runService = new TestSuiteRunService(
      projectRepository,
      scenarioRepository,
      suiteRepository,
      suiteRunRepository,
      itemRepository,
      gateway,
      {
        maxItems: 50,
        pollIntervalMs: 10,
        maxExecutionMs: 60000,
        allowConcurrentRuns: false,
        version: "test-v1"
      }
    );
    await projectRepository.create(project());
    await scenarioRepository.create(scenario("scenario-a", "첫 번째"));
    await scenarioRepository.create(scenario("scenario-b", "두 번째"));
  });

  afterEach(async () => {
    delete process.env.NUXT_STORAGE_ROOT;
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("snapshot test run을 순서대로 만들고 개별 testRunId를 연결한다", async () => {
    const suite = await suiteService.create("project-1", input("continue_on_failure"));
    const run = await runService.requestRun({ projectId: "project-1", suiteId: suite.id });
    expect(run.status).toBe("pending");
    await runService.executeRun(run.id);
    const detail = await runService.getDetail(run.id);
    expect(gateway.requestedScenarioIds).toEqual(["scenario-a", "scenario-b"]);
    expect(detail.run.status).toBe("success");
    expect(detail.run.progressRate).toBe(100);
    expect(detail.items.map((item) => item.testRunId)).toEqual([
      "test-run-1",
      "test-run-2"
    ]);
  });

  it("stop_on_failure에서 이후 항목을 blocked 처리한다", async () => {
    gateway.statuses["scenario-a"] = "failed";
    const suite = await suiteService.create("project-1", input("stop_on_failure"));
    const run = await runService.requestRun({ projectId: "project-1", suiteId: suite.id });
    await runService.executeRun(run.id);
    const detail = await runService.getDetail(run.id);
    expect(detail.items.map((item) => item.status)).toEqual(["failed", "blocked"]);
    expect(detail.items[1]?.causedByScenarioId).toBe("scenario-a");
    expect(detail.run.status).toBe("failed");
    expect(gateway.requestedScenarioIds).toEqual(["scenario-a"]);
  });

  it("pending 실행이 있으면 같은 스위트의 중복 실행을 거부한다", async () => {
    const suite = await suiteService.create("project-1", input("continue_on_failure"));
    await runService.requestRun({ projectId: "project-1", suiteId: suite.id });
    await expect(
      runService.requestRun({ projectId: "project-1", suiteId: suite.id })
    ).rejects.toMatchObject({ code: "TEST_SUITE_RUN_IN_PROGRESS" });
  });

  it("실행 요청 뒤 원본을 수정해도 실행 snapshot은 유지된다", async () => {
    const suite = await suiteService.create("project-1", input("continue_on_failure"));
    const run = await runService.requestRun({ projectId: "project-1", suiteId: suite.id });
    const original = await scenarioRepository.findById("scenario-a");
    expect(original).not.toBeNull();
    if (original !== null) {
      await scenarioRepository.update("scenario-a", { ...original, name: "수정된 이름" });
    }
    const stored = await runService.getDetail(run.id);
    expect(stored.run.suiteSnapshot.items[0]?.scenarioName).toBe("첫 번째");
    expect(stored.run.suiteSnapshot.items[0]?.scenarioSnapshot.name).toBe("첫 번째");
  });

  it("삭제된 시나리오가 남은 스위트의 실행을 차단한다", async () => {
    const suite = await suiteService.create("project-1", input("continue_on_failure"));
    await scenarioRepository.delete("scenario-b");
    await expect(
      runService.requestRun({ projectId: "project-1", suiteId: suite.id })
    ).rejects.toMatchObject({ code: "TEST_SUITE_SCENARIO_NOT_FOUND" });
  });

  it("다른 프로젝트 시나리오와 중복 시나리오 구성을 거부한다", async () => {
    await projectRepository.create({ ...project(), id: "project-2", name: "다른 프로젝트" });
    await scenarioRepository.create({ ...scenario("scenario-c", "외부"), projectId: "project-2" });
    await expect(
      suiteService.create("project-1", {
        ...input("continue_on_failure"),
        items: [{ scenarioId: "scenario-c", order: 1, enabled: true, required: true }]
      })
    ).rejects.toMatchObject({ code: "TEST_SUITE_PROJECT_MISMATCH" });
    await expect(
      suiteService.create("project-1", {
        ...input("continue_on_failure"),
        items: [
          { scenarioId: "scenario-a", order: 1, enabled: true, required: true },
          { scenarioId: "scenario-a", order: 2, enabled: true, required: true }
        ]
      })
    ).rejects.toMatchObject({ code: "TEST_SUITE_DUPLICATE_SCENARIO" });
  });
});

function project(): TestProject {
  return {
    id: "project-1",
    name: "프로젝트",
    baseUrl: "http://127.0.0.1:3000",
    environmentName: "test",
    defaultTimeout: 10000,
    stopOnFailure: true,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z"
  };
}

function scenario(id: string, name: string): TestScenario {
  return {
    id,
    projectId: "project-1",
    name,
    startUrl: "/",
    stopOnFailure: true,
    timeout: 10000,
    steps: [{ id: `${id}-step`, order: 1, name: "이동", action: "goto", value: "/", timeout: 5000, required: true }],
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z"
  };
}

function input(policy: TestSuiteInput["executionPolicy"]): TestSuiteInput {
  return {
    name: "관리자 기본 기능 점검",
    status: "active",
    executionPolicy: policy,
    items: [
      { scenarioId: "scenario-a", order: 1, enabled: true, required: true },
      { scenarioId: "scenario-b", order: 2, enabled: true, required: true }
    ]
  };
}
