import type {
  AiScenarioConversion,
  AiScenarioConversionRequest,
  AiScenarioConversionResult,
  AiScenarioSaveMetadata
} from "../../../shared/types/ai-scenario.js";
import type { ScenarioInput } from "../../../shared/types/scenario.js";
import { validateScenarioInput } from "../../../shared/schemas/scenario.schema.js";
import type { AiConversionRepository } from "../../repositories/ai-conversion.repository.js";
import type { ProjectRepository } from "../../repositories/project.repository.js";
import { AppError } from "../../utils/api.js";
import { nowIso } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import { OpenAiScenarioClient } from "../clients/openai.client.js";
import {
  AiResponseSchemaError,
  parseAiScenarioProviderResponse
} from "../schemas/ai-scenario-response.schema.js";
import type {
  AiProviderConfig,
  AiScenarioProviderFactory
} from "../types/ai-scenario.js";
import { AiProviderError } from "../types/ai-scenario.js";
import { normalizeAiConversionResponse } from "../utils/conversion-normalizer.js";
import {
  extractEnvironmentReferences
} from "../utils/prompt-input-builder.js";
import {
  AiRequestGuard,
  hashAiConversionContent
} from "../utils/request-guard.js";
import { detectSensitiveData } from "../utils/sensitive-data-detector.js";

export interface AiConversionContext {
  requesterId: string;
  providerConfig: AiProviderConfig;
  signal?: AbortSignal;
}

export class AiScenarioService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly conversionRepository: AiConversionRepository,
    private readonly providerFactory: AiScenarioProviderFactory = (
      config
    ) => new OpenAiScenarioClient(config),
    private readonly requestGuard = new AiRequestGuard()
  ) {}

  async convert(
    input: AiScenarioConversionRequest,
    context: AiConversionContext
  ): Promise<AiScenarioConversionResult> {
    await this.requireProject(input.projectId);
    this.assertNoSensitiveData(input);
    this.assertProviderConfigured(context.providerConfig);

    const contentHash = hashAiConversionContent(input);
    const lease = this.requestGuard.acquire(
      context.requesterId,
      contentHash
    );
    const timestamp = nowIso();
    const conversion: AiScenarioConversion = {
      id: createId("conversion"),
      projectId: input.projectId,
      name: input.name,
      naturalLanguage: input.naturalLanguage,
      status: "pending",
      model: context.providerConfig.model,
      promptVersion: context.providerConfig.promptVersion,
      availableEnvironmentVariables: input.availableEnvironmentVariables,
      warnings: [],
      missingInformation: [],
      unsupportedSteps: [],
      assumptions: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await this.conversionRepository.create(conversion);
    await this.conversionRepository.patch(conversion.id, {
      status: "processing",
      updatedAt: nowIso()
    });

    let completed = false;
    try {
      const provider = this.providerFactory(context.providerConfig);
      const output = await provider.convert(input, context.signal);
      const validated = parseAiScenarioProviderResponse(
        output.response,
        context.providerConfig.maxSteps
      );
      const normalized = normalizeAiConversionResponse(validated, input);
      const updated = await this.conversionRepository.patch(conversion.id, {
        status: "review_required",
        scenarioDraft: normalized.scenarioDraft,
        warnings: normalized.warnings,
        missingInformation: normalized.missingInformation,
        unsupportedSteps: normalized.unsupportedSteps,
        assumptions: normalized.assumptions,
        ...(output.usage.inputTokenCount === undefined
          ? {}
          : { inputTokenCount: output.usage.inputTokenCount }),
        ...(output.usage.outputTokenCount === undefined
          ? {}
          : { outputTokenCount: output.usage.outputTokenCount }),
        updatedAt: nowIso()
      });
      if (updated === null) {
        throw new AppError(
          404,
          "AI_CONVERSION_NOT_FOUND",
          "AI 변환 기록을 찾을 수 없습니다."
        );
      }
      completed = true;
      return {
        conversionId: conversion.id,
        status: "review_required",
        scenarioDraft: normalized.scenarioDraft,
        warnings: normalized.warnings,
        missingInformation: normalized.missingInformation,
        unsupportedSteps: normalized.unsupportedSteps,
        assumptions: normalized.assumptions,
        summary: normalized.summary
      };
    } catch (error: unknown) {
      const failure = normalizeConversionError(error);
      await this.conversionRepository.patch(conversion.id, {
        status: "failed",
        failureCode: failure.code,
        failureMessage: failure.message,
        updatedAt: nowIso()
      });
      throw failure;
    } finally {
      lease.release(completed);
    }
  }

  async validateBeforeSave(
    projectId: string,
    input: ScenarioInput,
    metadata: AiScenarioSaveMetadata
  ): Promise<void> {
    const conversion = await this.requireConversion(
      metadata.conversionId,
      projectId
    );
    if (
      conversion.status !== "review_required" ||
      conversion.scenarioDraft === undefined
    ) {
      throw new AppError(
        409,
        "SCENARIO_VALIDATION_FAILED",
        "검토 가능한 AI 초안이 아닙니다. 다시 변환해 주세요."
      );
    }

    const issues = validateScenarioInput(input).map((issue) => issue.message);
    const inputStepIds = new Set(input.steps.map((step) => step.id));
    const reviewedIds = new Set(metadata.reviewedStepIds);
    const unreviewed = conversion.scenarioDraft.steps.filter(
      (step) =>
        step.reviewRequired &&
        inputStepIds.has(step.temporaryId) &&
        !reviewedIds.has(step.temporaryId)
    );
    if (unreviewed.length > 0) {
      issues.push(
        `검토가 필요한 단계 ${unreviewed.length}개를 확인 완료해 주세요.`
      );
    }
    if (
      conversion.unsupportedSteps.length > 0 &&
      !metadata.unsupportedStepsConfirmed
    ) {
      issues.push("지원하지 않는 단계를 확인했다고 표시해 주세요.");
    }

    const unavailableEnvironmentNames = new Set<string>();
    input.steps.forEach((step) => {
      if (step.value === undefined) {
        return;
      }
      extractEnvironmentReferences(step.value)
        .filter(
          (name) =>
            !conversion.availableEnvironmentVariables.includes(name)
        )
        .forEach((name) => unavailableEnvironmentNames.add(name));
    });
    if (unavailableEnvironmentNames.size > 0) {
      issues.push(
        `사용 가능한 환경변수 목록에 없는 참조가 있습니다: ${[
          ...unavailableEnvironmentNames
        ].join(", ")}`
      );
    }
    if (issues.length > 0) {
      throw new AppError(
        400,
        "SCENARIO_VALIDATION_FAILED",
        issues[0] ?? "AI 초안의 저장 조건을 확인해 주세요.",
        { issues }
      );
    }
  }

  async markSaved(
    conversionId: string,
    projectId: string,
    scenarioId: string
  ): Promise<void> {
    await this.requireConversion(conversionId, projectId);
    const saved = await this.conversionRepository.linkScenario(
      conversionId,
      scenarioId,
      nowIso()
    );
    if (saved === null) {
      throw new AppError(
        404,
        "AI_CONVERSION_NOT_FOUND",
        "AI 변환 기록을 찾을 수 없습니다."
      );
    }
  }

  private async requireProject(projectId: string): Promise<void> {
    if ((await this.projectRepository.findById(projectId)) === null) {
      throw new AppError(
        404,
        "PROJECT_NOT_FOUND",
        "테스트 프로젝트를 찾을 수 없습니다."
      );
    }
  }

  private async requireConversion(
    conversionId: string,
    projectId: string
  ): Promise<AiScenarioConversion> {
    const conversion =
      await this.conversionRepository.findById(conversionId);
    if (conversion === null || conversion.projectId !== projectId) {
      throw new AppError(
        404,
        "AI_CONVERSION_NOT_FOUND",
        "AI 변환 기록을 찾을 수 없습니다."
      );
    }
    return conversion;
  }

  private assertProviderConfigured(config: AiProviderConfig): void {
    if (config.apiKey.trim().length === 0) {
      throw new AppError(
        503,
        "AI_PROVIDER_ERROR",
        "OpenAI API 키가 설정되지 않았습니다. 서버 환경변수를 설정한 뒤 다시 시도해 주세요."
      );
    }
    if (config.model.trim().length === 0) {
      throw new AppError(
        503,
        "AI_PROVIDER_ERROR",
        "AI 변환 모델이 설정되지 않았습니다. OPENAI_SCENARIO_MODEL을 설정해 주세요."
      );
    }
  }

  private assertNoSensitiveData(input: AiScenarioConversionRequest): void {
    const findings = detectSensitiveData(
      [
        input.name,
        input.description ?? "",
        input.startUrl,
        input.naturalLanguage,
        input.additionalContext ?? ""
      ].join("\n"),
      input.availableEnvironmentVariables
    );
    if (findings.length > 0) {
      throw new AppError(
        400,
        "AI_SENSITIVE_DATA_DETECTED",
        "입력 내용에서 민감정보로 보이는 값이 발견되었습니다. 실제 값을 입력하지 말고 {{TEST_PASSWORD}}와 같은 환경변수 참조를 사용해 주세요.",
        { categories: findings.map((finding) => finding.category) }
      );
    }
  }
}

function normalizeConversionError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof AiResponseSchemaError) {
    return new AppError(
      502,
      "AI_INVALID_RESPONSE",
      "AI가 반환한 테스트 단계 형식이 올바르지 않습니다. 다시 시도해 주세요."
    );
  }
  if (error instanceof AiProviderError) {
    if (error.kind === "timeout") {
      return new AppError(
        504,
        "AI_TIMEOUT",
        "AI 변환 요청 시간이 초과되었습니다. 입력을 줄이거나 잠시 후 다시 시도해 주세요."
      );
    }
    if (error.kind === "invalid_response") {
      return new AppError(
        502,
        "AI_INVALID_RESPONSE",
        "AI가 유효한 구조의 테스트 단계를 반환하지 않았습니다. 다시 시도해 주세요."
      );
    }
    if (error.kind === "rate_limited") {
      return new AppError(
        429,
        "AI_RATE_LIMITED",
        "AI 제공자의 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."
      );
    }
    return new AppError(
      502,
      "AI_PROVIDER_ERROR",
      "AI 변환 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요."
    );
  }
  return new AppError(
    500,
    "AI_CONVERSION_FAILED",
    "테스트 절차를 변환하지 못했습니다. 내용을 확인한 뒤 다시 시도해 주세요."
  );
}
