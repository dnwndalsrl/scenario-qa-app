import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiDraftStepToTestStep } from "../../../shared/types/ai-scenario.js";
import type { TestProject } from "../../../shared/types/project.js";
import { AiConversionRepository } from "../../repositories/ai-conversion.repository.js";
import { ProjectRepository } from "../../repositories/project.repository.js";
import { AppError } from "../../utils/api.js";
import {
  createConversionInput,
  createProviderResponse
} from "../test-fixtures.js";
import type {
  AiProviderConfig,
  AiScenarioProvider
} from "../types/ai-scenario.js";
import { AiProviderError } from "../types/ai-scenario.js";
import { AiRequestGuard } from "../utils/request-guard.js";
import { AiScenarioService } from "./ai-scenario.service.js";

const providerConfig: AiProviderConfig = {
  apiKey: "test-key",
  model: "test-model",
  promptVersion: "v1",
  maxSteps: 50,
  timeoutMs: 1000
};

let storageRoot = "";
let projectRepository: ProjectRepository;
let conversionRepository: AiConversionRepository;

beforeEach(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), "scenario-ai-test-"));
  process.env.NUXT_STORAGE_ROOT = storageRoot;
  projectRepository = new ProjectRepository();
  conversionRepository = new AiConversionRepository();
  const project: TestProject = {
    id: "project-ai-test",
    name: "AI 테스트 프로젝트",
    baseUrl: "http://localhost:3000",
    environmentName: "test",
    defaultTimeout: 15000,
    stopOnFailure: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  await projectRepository.create(project);
});

afterEach(async () => {
  delete process.env.NUXT_STORAGE_ROOT;
  await rm(storageRoot, { recursive: true, force: true });
});

describe("AiScenarioService", () => {
  it("정상 변환을 저장하고 검토 완료 후 시나리오 연결을 허용한다", async () => {
    const provider: AiScenarioProvider = {
      convert: vi.fn().mockResolvedValue({
        response: createProviderResponse(),
        usage: { inputTokenCount: 100, outputTokenCount: 200 }
      })
    };
    const service = createService(provider);
    const converted = await service.convert(createConversionInput(), {
      requesterId: "127.0.0.1",
      providerConfig
    });
    expect(converted.status).toBe("review_required");
    expect(converted.scenarioDraft.steps).toHaveLength(4);
    const scenarioInput = {
      name: converted.scenarioDraft.name,
      startUrl: converted.scenarioDraft.startUrl,
      stopOnFailure: converted.scenarioDraft.stopOnFailure,
      timeout: converted.scenarioDraft.timeout,
      steps: converted.scenarioDraft.steps.map(aiDraftStepToTestStep)
    };

    await expect(
      service.validateBeforeSave("project-ai-test", scenarioInput, {
        conversionId: converted.conversionId,
        reviewedStepIds: [],
        unsupportedStepsConfirmed: true
      })
    ).rejects.toMatchObject({
      code: "SCENARIO_VALIDATION_FAILED"
    });

    await expect(
      service.validateBeforeSave("project-ai-test", scenarioInput, {
        conversionId: converted.conversionId,
        reviewedStepIds: ["draft-2"],
        unsupportedStepsConfirmed: true
      })
    ).resolves.toBeUndefined();
    await service.markSaved(
      converted.conversionId,
      "project-ai-test",
      "scenario-saved"
    );
    await expect(
      conversionRepository.findById(converted.conversionId)
    ).resolves.toMatchObject({
      status: "saved",
      scenarioId: "scenario-saved",
      inputTokenCount: 100,
      outputTokenCount: 200
    });
  });

  it("민감정보가 있으면 provider를 호출하지 않는다", async () => {
    const convert = vi.fn();
    const service = createService({ convert });
    const input = {
      ...createConversionInput(),
      naturalLanguage: "로그인한다.\npassword: qa-password-123"
    };
    await expect(
      service.convert(input, {
        requesterId: "127.0.0.1",
        providerConfig
      })
    ).rejects.toMatchObject({
      code: "AI_SENSITIVE_DATA_DETECTED"
    });
    expect(convert).not.toHaveBeenCalled();
    await expect(conversionRepository.list()).resolves.toEqual([]);
  });

  it("AI timeout을 공개 오류로 변환하고 실패 기록을 남긴다", async () => {
    const provider: AiScenarioProvider = {
      convert: vi
        .fn()
        .mockRejectedValue(
          new AiProviderError("timeout", "internal provider detail")
        )
    };
    const service = createService(provider);
    try {
      await service.convert(createConversionInput(), {
        requesterId: "127.0.0.1",
        providerConfig
      });
      throw new Error("timeout 오류가 발생하지 않았습니다.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("AI_TIMEOUT");
      expect((error as AppError).message).not.toContain("internal provider");
    }
    const records = await conversionRepository.list();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      status: "failed",
      failureCode: "AI_TIMEOUT"
    });
  });

  it("API 키가 없으면 provider 호출 전에 중단한다", async () => {
    const convert = vi.fn();
    const service = createService({ convert });
    await expect(
      service.convert(createConversionInput(), {
        requesterId: "127.0.0.1",
        providerConfig: { ...providerConfig, apiKey: "" }
      })
    ).rejects.toMatchObject({ code: "AI_PROVIDER_ERROR" });
    expect(convert).not.toHaveBeenCalled();
  });
});

function createService(provider: AiScenarioProvider): AiScenarioService {
  return new AiScenarioService(
    projectRepository,
    conversionRepository,
    () => provider,
    new AiRequestGuard({
      windowMs: 60_000,
      maxRequests: 20,
      duplicateTtlMs: 1
    })
  );
}
