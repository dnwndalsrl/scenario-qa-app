import type {
  AiFailureAnalysis,
  AiFailureAnalysisAccepted
} from "../../../shared/types/ai-failure-analysis.js";
import type { AiFailureAnalysisRepository } from "../../repositories/ai-failure-analysis.repository.js";
import type { ProjectRepository } from "../../repositories/project.repository.js";
import type { ScenarioRepository } from "../../repositories/scenario.repository.js";
import type { TestRunService } from "../../services/test-run.service.js";
import { AppError } from "../../utils/api.js";
import { nowIso } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import { OpenAiFailureAnalysisClient } from "../clients/openai.client.js";
import {
  AiFailureAnalysisSchemaError,
  parseAiFailureAnalysisResponse
} from "../schemas/ai-failure-analysis-response.schema.js";
import type {
  AiFailureAnalysisProviderConfig,
  AiFailureAnalysisProviderFactory
} from "../types/ai-failure-analysis.js";
import { AiProviderError } from "../types/ai-scenario.js";
import { buildFailureAnalysisInput } from "../utils/analysis-input-builder.js";
import { normalizeFailureAnalysisResult } from "../utils/analysis-normalizer.js";
import { createAnalysisInputFingerprint } from "../utils/input-fingerprint.js";

const ANALYZABLE_STATUSES = new Set(["failed", "error", "blocked"]);
const activeRunIds = new Set<string>();

export class AiFailureAnalysisService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly scenarioRepository: ScenarioRepository,
    private readonly testRunService: TestRunService,
    private readonly analysisRepository: AiFailureAnalysisRepository,
    private readonly providerFactory: AiFailureAnalysisProviderFactory = (
      config
    ) => new OpenAiFailureAnalysisClient(config)
  ) {}

  async request(
    runId: string,
    force: boolean,
    config: AiFailureAnalysisProviderConfig
  ): Promise<AiFailureAnalysisAccepted> {
    const source = await this.loadSource(runId);
    this.assertAnalyzable(source.detail.run.status);
    const input = buildFailureAnalysisInput(
      source.project,
      source.scenario,
      source.detail,
      config
    );
    const inputFingerprint = createAnalysisInputFingerprint(input);

    const repositoryActive = await this.analysisRepository.findActiveByRun(
      runId
    );
    if (activeRunIds.has(runId) || repositoryActive !== null) {
      throw new AppError(
        409,
        "AI_ANALYSIS_IN_PROGRESS",
        "이 테스트 실행은 이미 AI 분석 중입니다. 완료된 뒤 다시 확인해 주세요."
      );
    }

    if (!force) {
      const completed =
        await this.analysisRepository.findCompletedByFingerprint(
          runId,
          inputFingerprint
        );
      if (completed !== null) {
        return {
          analysisId: completed.id,
          runId,
          status: "completed",
          reused: true
        };
      }
    }

    const timestamp = nowIso();
    const analysis: AiFailureAnalysis = {
      id: createId("analysis"),
      runId,
      projectId: source.project.id,
      scenarioId: source.scenario.id,
      status: "pending",
      model: config.model,
      promptVersion: config.promptVersion,
      inputFingerprint,
      evidence: input.evidence,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    activeRunIds.add(runId);
    try {
      await this.analysisRepository.create(analysis);
    } catch (error: unknown) {
      activeRunIds.delete(runId);
      throw error;
    }
    return {
      analysisId: analysis.id,
      runId,
      status: "pending",
      reused: false
    };
  }

  async execute(
    analysisId: string,
    config: AiFailureAnalysisProviderConfig,
    signal?: AbortSignal
  ): Promise<void> {
    const analysis = await this.requireAnalysis(analysisId);
    activeRunIds.add(analysis.runId);
    const startedAt = nowIso();
    try {
      this.assertProviderConfigured(config);
      const source = await this.loadSource(analysis.runId);
      this.assertAnalyzable(source.detail.run.status);
      const input = buildFailureAnalysisInput(
        source.project,
        source.scenario,
        source.detail,
        config
      );
      if (
        createAnalysisInputFingerprint(input) !== analysis.inputFingerprint
      ) {
        throw new AppError(
          409,
          "AI_ANALYSIS_FAILED",
          "분석 요청 이후 테스트 결과가 변경되었습니다. 새 분석을 요청해 주세요."
        );
      }
      await this.patchRequired(analysisId, {
        status: "processing",
        startedAt,
        updatedAt: startedAt
      });

      const output = await this.providerFactory(config).analyze(input, signal);
      const parsed = parseAiFailureAnalysisResponse(
        output.response,
        new Set(input.evidence.map((item) => item.id)),
        config
      );
      const result = normalizeFailureAnalysisResult(
        parsed,
        input.inputLimitations
      );
      const finishedAt = nowIso();
      await this.patchRequired(analysisId, {
        status: "completed",
        evidence: input.evidence,
        result,
        ...(output.usage.inputTokenCount === undefined
          ? {}
          : { inputTokenCount: output.usage.inputTokenCount }),
        ...(output.usage.outputTokenCount === undefined
          ? {}
          : { outputTokenCount: output.usage.outputTokenCount }),
        finishedAt,
        updatedAt: finishedAt
      });
    } catch (error: unknown) {
      const failure = normalizeAnalysisError(error);
      const finishedAt = nowIso();
      await this.analysisRepository.patch(analysisId, {
        status: "failed",
        errorCode: failure.code,
        errorMessage: failure.message,
        startedAt,
        finishedAt,
        updatedAt: finishedAt
      });
    } finally {
      activeRunIds.delete(analysis.runId);
    }
  }

  async getLatestByRun(runId: string): Promise<AiFailureAnalysis | null> {
    await this.testRunService.getDetail(runId);
    return (await this.analysisRepository.listByRun(runId))[0] ?? null;
  }

  async get(analysisId: string): Promise<AiFailureAnalysis> {
    return this.requireAnalysis(analysisId);
  }

  async retry(
    analysisId: string,
    config: AiFailureAnalysisProviderConfig
  ): Promise<AiFailureAnalysisAccepted> {
    const current = await this.requireAnalysis(analysisId);
    if (current.status === "pending" || current.status === "processing") {
      throw new AppError(
        409,
        "AI_ANALYSIS_IN_PROGRESS",
        "진행 중인 분석은 다시 요청할 수 없습니다."
      );
    }
    return this.request(current.runId, true, config);
  }

  private async loadSource(runId: string) {
    const detail = await this.testRunService.getDetail(runId);
    const [project, scenario] = await Promise.all([
      this.projectRepository.findById(detail.run.projectId),
      this.scenarioRepository.findById(detail.run.scenarioId)
    ]);
    if (project === null || scenario === null) {
      throw new AppError(
        404,
        "TEST_RUN_NOT_FOUND",
        "분석할 테스트 실행의 프로젝트 또는 시나리오를 찾을 수 없습니다."
      );
    }
    return { detail, project, scenario };
  }

  private assertAnalyzable(status: string): void {
    if (status === "pending" || status === "running") {
      throw new AppError(
        409,
        "TEST_RUN_NOT_COMPLETED",
        "테스트 실행이 완료된 뒤 AI 분석을 요청해 주세요."
      );
    }
    if (!ANALYZABLE_STATUSES.has(status)) {
      throw new AppError(
        400,
        "AI_ANALYSIS_NOT_ALLOWED",
        "성공한 테스트는 실패 원인 분석 대상이 아닙니다."
      );
    }
  }

  private assertProviderConfigured(
    config: AiFailureAnalysisProviderConfig
  ): void {
    if (config.apiKey.trim().length === 0) {
      throw new AppError(
        503,
        "AI_ANALYSIS_PROVIDER_ERROR",
        "OpenAI API 키가 설정되지 않았습니다. 서버 환경변수를 설정한 뒤 다시 분석해 주세요."
      );
    }
    if (config.model.trim().length === 0) {
      throw new AppError(
        503,
        "AI_ANALYSIS_PROVIDER_ERROR",
        "실패 분석 모델이 설정되지 않았습니다. OPENAI_FAILURE_ANALYSIS_MODEL을 설정해 주세요."
      );
    }
  }

  private async requireAnalysis(
    analysisId: string
  ): Promise<AiFailureAnalysis> {
    const analysis = await this.analysisRepository.findById(analysisId);
    if (analysis === null) {
      throw new AppError(
        404,
        "AI_ANALYSIS_NOT_FOUND",
        "AI 실패 분석 기록을 찾을 수 없습니다."
      );
    }
    return analysis;
  }

  private async patchRequired(
    analysisId: string,
    changes: Partial<AiFailureAnalysis>
  ): Promise<void> {
    if ((await this.analysisRepository.patch(analysisId, changes)) === null) {
      throw new AppError(
        404,
        "AI_ANALYSIS_NOT_FOUND",
        "AI 실패 분석 기록을 찾을 수 없습니다."
      );
    }
  }
}

function normalizeAnalysisError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof AiFailureAnalysisSchemaError) {
    return new AppError(
      502,
      error.code,
      error.code === "AI_ANALYSIS_EVIDENCE_INVALID"
        ? "AI가 존재하지 않는 근거를 참조했습니다. 결과를 저장하지 않았습니다. 다시 분석해 주세요."
        : "AI 분석 결과 형식이 올바르지 않습니다. 다시 분석해 주세요."
    );
  }
  if (error instanceof AiProviderError) {
    if (error.kind === "timeout") {
      return new AppError(
        504,
        "AI_ANALYSIS_TIMEOUT",
        "AI 분석 시간이 초과되었습니다. 잠시 후 다시 분석해 주세요."
      );
    }
    return new AppError(
      502,
      "AI_ANALYSIS_PROVIDER_ERROR",
      "AI 분석 서비스를 처리하지 못했습니다. 잠시 후 다시 분석해 주세요."
    );
  }
  return new AppError(
    500,
    "AI_ANALYSIS_FAILED",
    "AI 실패 분석 중 오류가 발생했습니다. 기존 테스트 결과는 그대로 유지됩니다."
  );
}
