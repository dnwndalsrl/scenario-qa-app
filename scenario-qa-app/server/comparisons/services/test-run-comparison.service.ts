import type { TestStep } from "../../../shared/types/scenario.js";
import type {
  TestRunComparison,
  TestRunComparisonAccepted,
  TestRunComparisonRequest
} from "../../../shared/types/test-run-comparison.js";
import { TEST_RUN_COMPARISON_ERROR_CODES } from "../../../shared/types/test-run-comparison.js";
import type { TestRunComparisonRepository } from "../../repositories/test-run-comparison.repository.js";
import type { TestRunRepository } from "../../repositories/test-run.repository.js";
import type { StoredTestRun } from "../../types/storage.js";
import { AppError } from "../../utils/api.js";
import { nowIso } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import type { TestRunService } from "../../services/test-run.service.js";
import type {
  ComparableStep,
  ComparisonConfig,
  RunComparisonInput
} from "../types/test-run-comparison.js";
import { compareTestRuns } from "../utils/test-run-comparator.js";

const COMPLETED_STATUSES = new Set(["success", "failed", "blocked", "error"]);
const activeComparisons = new Set<string>();

export class TestRunComparisonService {
  constructor(
    private readonly testRunRepository: TestRunRepository,
    private readonly testRunService: TestRunService,
    private readonly repository: TestRunComparisonRepository,
    private readonly config: ComparisonConfig
  ) {}

  async requestComparison(
    request: TestRunComparisonRequest
  ): Promise<TestRunComparisonAccepted> {
    const { baseline, comparison } = await this.validateRuns(request);
    const existing = await this.repository.findCombination(
      request.baselineRunId,
      request.comparisonRunId,
      this.config.algorithmVersion
    );
    if (existing?.status === "completed") {
      return {
        comparisonId: existing.id,
        status: existing.status,
        reused: true
      };
    }
    if (
      existing !== null &&
      (existing.status === "pending" || existing.status === "processing")
    ) {
      throw new AppError(
        409,
        TEST_RUN_COMPARISON_ERROR_CODES.RUN_COMPARISON_IN_PROGRESS,
        "동일한 실행 결과 비교가 이미 진행 중입니다. 완료된 뒤 다시 확인해 주세요."
      );
    }

    const timestamp = nowIso();
    const record: TestRunComparison = {
      id: createId("comparison"),
      projectId: baseline.projectId,
      scenarioId: baseline.scenarioId,
      baselineRunId: baseline.id,
      comparisonRunId: comparison.id,
      algorithmVersion: this.config.algorithmVersion,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await this.repository.create(record);
    return {
      comparisonId: record.id,
      status: record.status,
      reused: false
    };
  }

  async executeComparison(comparisonId: string): Promise<void> {
    if (activeComparisons.has(comparisonId)) {
      return;
    }
    activeComparisons.add(comparisonId);
    try {
      const record = await this.requireComparison(comparisonId);
      if (record.status === "completed") {
        return;
      }
      await this.requirePatch(comparisonId, {
        status: "processing",
        updatedAt: nowIso()
      });
      const { baseline, comparison } = await this.validateRuns({
        baselineRunId: record.baselineRunId,
        comparisonRunId: record.comparisonRunId
      });
      const [baselineDetail, comparisonDetail] = await Promise.all([
        this.testRunService.getDetail(baseline.id),
        this.testRunService.getDetail(comparison.id)
      ]);
      if (baselineDetail.result === null || comparisonDetail.result === null) {
        throw new AppError(
          400,
          TEST_RUN_COMPARISON_ERROR_CODES.RUN_RESULT_NOT_FOUND,
          "비교에 필요한 테스트 실행 결과가 없습니다. 결과가 저장된 실행을 선택해 주세요."
        );
      }
      const input: RunComparisonInput = {
        baselineRun: baselineDetail.run,
        comparisonRun: comparisonDetail.run,
        baselineResult: baselineDetail.result,
        comparisonResult: comparisonDetail.result,
        baselineSteps: toComparableSteps(
          baselineDetail.result.steps,
          baseline.scenarioSteps
        ),
        comparisonSteps: toComparableSteps(
          comparisonDetail.result.steps,
          comparison.scenarioSteps
        )
      };
      const completed = compareTestRuns(input, this.config);
      const completedAt = nowIso();
      await this.requirePatch(comparisonId, {
        ...completed,
        status: "completed",
        updatedAt: completedAt,
        completedAt
      });
    } catch (error: unknown) {
      const normalized = normalizeComparisonError(error);
      await this.repository
        .patch(comparisonId, {
          status: "failed",
          errorCode: normalized.code,
          errorMessage: normalized.message,
          updatedAt: nowIso(),
          completedAt: nowIso()
        })
        .catch(() => undefined);
    } finally {
      activeComparisons.delete(comparisonId);
    }
  }

  async get(comparisonId: string): Promise<TestRunComparison> {
    return this.requireComparison(comparisonId);
  }

  async listByRun(runId: string): Promise<TestRunComparison[]> {
    if ((await this.testRunRepository.findById(runId)) === null) {
      throw new AppError(
        404,
        TEST_RUN_COMPARISON_ERROR_CODES.COMPARISON_RUN_NOT_FOUND,
        "테스트 실행 정보를 찾을 수 없습니다."
      );
    }
    return sortNewest(await this.repository.listByRun(runId));
  }

  async listByScenario(
    projectId: string,
    scenarioId: string
  ): Promise<TestRunComparison[]> {
    return sortNewest(await this.repository.listByScenario(projectId, scenarioId));
  }

  private async validateRuns(request: TestRunComparisonRequest): Promise<{
    baseline: StoredTestRun;
    comparison: StoredTestRun;
  }> {
    if (request.baselineRunId === request.comparisonRunId) {
      throw new AppError(
        400,
        TEST_RUN_COMPARISON_ERROR_CODES.RUNS_MUST_BE_DIFFERENT,
        "기준 실행과 비교 실행은 서로 달라야 합니다."
      );
    }
    const baseline = await this.testRunRepository.findById(
      request.baselineRunId
    );
    if (baseline === null) {
      throw new AppError(
        404,
        TEST_RUN_COMPARISON_ERROR_CODES.BASELINE_RUN_NOT_FOUND,
        "기준 실행 결과를 찾을 수 없습니다."
      );
    }
    const comparison = await this.testRunRepository.findById(
      request.comparisonRunId
    );
    if (comparison === null) {
      throw new AppError(
        404,
        TEST_RUN_COMPARISON_ERROR_CODES.COMPARISON_RUN_NOT_FOUND,
        "비교 실행 결과를 찾을 수 없습니다."
      );
    }
    if (baseline.projectId !== comparison.projectId) {
      throw new AppError(
        400,
        TEST_RUN_COMPARISON_ERROR_CODES.RUNS_PROJECT_MISMATCH,
        "서로 다른 프로젝트의 실행 결과는 비교할 수 없습니다."
      );
    }
    if (baseline.scenarioId !== comparison.scenarioId) {
      throw new AppError(
        400,
        TEST_RUN_COMPARISON_ERROR_CODES.RUNS_SCENARIO_MISMATCH,
        "서로 다른 테스트 시나리오의 실행 결과는 비교할 수 없습니다. 동일한 시나리오의 실행 결과를 선택해 주세요."
      );
    }
    if (
      !COMPLETED_STATUSES.has(baseline.status) ||
      !COMPLETED_STATUSES.has(comparison.status)
    ) {
      throw new AppError(
        400,
        TEST_RUN_COMPARISON_ERROR_CODES.RUN_NOT_COMPLETED,
        "완료된 테스트 실행 결과만 비교할 수 있습니다."
      );
    }
    if (
      baseline.resultFilePath === undefined ||
      comparison.resultFilePath === undefined
    ) {
      throw new AppError(
        400,
        TEST_RUN_COMPARISON_ERROR_CODES.RUN_RESULT_NOT_FOUND,
        "비교에 필요한 테스트 실행 결과가 없습니다. 결과가 저장된 실행을 선택해 주세요."
      );
    }
    return { baseline, comparison };
  }

  private async requireComparison(id: string): Promise<TestRunComparison> {
    const comparison = await this.repository.findById(id);
    if (comparison === null) {
      throw new AppError(
        404,
        TEST_RUN_COMPARISON_ERROR_CODES.RUN_COMPARISON_NOT_FOUND,
        "테스트 실행 비교 결과를 찾을 수 없습니다."
      );
    }
    return comparison;
  }

  private async requirePatch(
    id: string,
    changes: Partial<TestRunComparison>
  ): Promise<TestRunComparison> {
    const saved = await this.repository.patch(id, changes);
    if (saved === null) {
      throw new AppError(
        404,
        TEST_RUN_COMPARISON_ERROR_CODES.RUN_COMPARISON_NOT_FOUND,
        "테스트 실행 비교 결과를 찾을 수 없습니다."
      );
    }
    return saved;
  }
}

function toComparableSteps(
  results: RunComparisonInput["baselineResult"]["steps"],
  definitions: TestStep[] | undefined
): ComparableStep[] {
  return results.map((result, index) => ({
    result,
    order: definitions?.find((step) => step.id === result.stepId)?.order ?? index + 1,
    ...(() => {
      const definition =
        definitions?.find((step) => step.id === result.stepId) ?? definitions?.[index];
      return definition === undefined ? {} : { definition };
    })()
  }));
}

function normalizeComparisonError(error: unknown): {
  code: string;
  message: string;
} {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: TEST_RUN_COMPARISON_ERROR_CODES.RUN_COMPARISON_FAILED,
    message: "테스트 실행 결과를 비교하지 못했습니다. 원본 실행 결과는 변경되지 않았습니다."
  };
}

function sortNewest(items: TestRunComparison[]): TestRunComparison[] {
  return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
