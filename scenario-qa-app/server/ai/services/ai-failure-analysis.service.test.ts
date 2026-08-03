import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiFailureAnalysis } from "../../../shared/types/ai-failure-analysis.js";
import type { AiFailureAnalysisRepository } from "../../repositories/ai-failure-analysis.repository.js";
import type { ProjectRepository } from "../../repositories/project.repository.js";
import type { ScenarioRepository } from "../../repositories/scenario.repository.js";
import type { TestRunService } from "../../services/test-run.service.js";
import {
  failureLimits,
  failureProject,
  failureRunDetail,
  failureScenario,
  toProviderResponse,
  validAnalysisResult
} from "../failure-test-fixtures.js";
import type {
  AiFailureAnalysisProvider,
  AiFailureAnalysisProviderConfig
} from "../types/ai-failure-analysis.js";
import { AiProviderError } from "../types/ai-scenario.js";
import { AiFailureAnalysisService } from "./ai-failure-analysis.service.js";

const config: AiFailureAnalysisProviderConfig = {
  ...failureLimits,
  apiKey: "test-key",
  model: "test-model",
  promptVersion: "v1",
  timeoutMs: 60000
};

class MemoryAnalysisRepository {
  items: AiFailureAnalysis[] = [];

  async create(value: AiFailureAnalysis): Promise<AiFailureAnalysis> {
    this.items.push(structuredClone(value));
    return value;
  }

  async findById(id: string): Promise<AiFailureAnalysis | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async listByRun(runId: string): Promise<AiFailureAnalysis[]> {
    return this.items
      .filter((item) => item.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findActiveByRun(runId: string): Promise<AiFailureAnalysis | null> {
    return (
      this.items.find(
        (item) =>
          item.runId === runId &&
          (item.status === "pending" || item.status === "processing")
      ) ?? null
    );
  }

  async findCompletedByFingerprint(
    runId: string,
    fingerprint: string
  ): Promise<AiFailureAnalysis | null> {
    return (
      this.items.find(
        (item) =>
          item.runId === runId &&
          item.status === "completed" &&
          item.inputFingerprint === fingerprint
      ) ?? null
    );
  }

  async patch(
    id: string,
    changes: Partial<AiFailureAnalysis>
  ): Promise<AiFailureAnalysis | null> {
    const index = this.items.findIndex((item) => item.id === id);
    const current = this.items[index];
    if (index < 0 || current === undefined) return null;
    const updated = { ...current, ...changes, id: current.id };
    this.items[index] = updated;
    return updated;
  }
}

function createService(provider: AiFailureAnalysisProvider) {
  const repository = new MemoryAnalysisRepository();
  const service = new AiFailureAnalysisService(
    {
      findById: vi.fn().mockResolvedValue(failureProject)
    } as unknown as ProjectRepository,
    {
      findById: vi.fn().mockResolvedValue(failureScenario)
    } as unknown as ScenarioRepository,
    {
      getDetail: vi.fn().mockResolvedValue(failureRunDetail)
    } as unknown as TestRunService,
    repository as unknown as AiFailureAnalysisRepository,
    () => provider
  );
  return { service, repository };
}

describe("AiFailureAnalysisService", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("pending을 즉시 만들고 처리 중 중복을 차단한 뒤 완료 결과를 재사용한다", async () => {
    const provider = {
      analyze: vi.fn().mockResolvedValue({
        response: toProviderResponse(),
        usage: { inputTokenCount: 100, outputTokenCount: 200 }
      })
    };
    const { service } = createService(provider);
    const accepted = await service.request(failureRunDetail.run.id, false, config);
    expect(accepted.status).toBe("pending");
    await expect(
      service.request(failureRunDetail.run.id, false, config)
    ).rejects.toMatchObject({ code: "AI_ANALYSIS_IN_PROGRESS" });

    await service.execute(accepted.analysisId, config);
    const completed = await service.get(accepted.analysisId);
    expect(completed.status).toBe("completed");
    expect(completed.result?.suspectedCauses[0]?.category).toBe(
      "authentication_failure"
    );
    expect(completed.inputTokenCount).toBe(100);

    const reused = await service.request(failureRunDetail.run.id, false, config);
    expect(reused).toMatchObject({
      analysisId: accepted.analysisId,
      status: "completed",
      reused: true
    });
    expect(provider.analyze).toHaveBeenCalledTimes(1);
  });

  it("force가 true이면 완료된 동일 입력도 새 분석을 만든다", async () => {
    const provider = {
      analyze: vi.fn().mockResolvedValue({
        response: toProviderResponse(),
        usage: {}
      })
    };
    const { service } = createService(provider);
    const first = await service.request(failureRunDetail.run.id, false, config);
    await service.execute(first.analysisId, config);
    const forced = await service.request(failureRunDetail.run.id, true, config);
    expect(forced.analysisId).not.toBe(first.analysisId);
    await service.execute(forced.analysisId, config);
  });

  it("API 키 누락과 timeout을 분석 레코드의 안전한 실패로 저장한다", async () => {
    const missing = createService({ analyze: vi.fn() });
    const accepted = await missing.service.request(
      failureRunDetail.run.id,
      false,
      { ...config, apiKey: "" }
    );
    await missing.service.execute(accepted.analysisId, { ...config, apiKey: "" });
    expect(await missing.service.get(accepted.analysisId)).toMatchObject({
      status: "failed",
      errorCode: "AI_ANALYSIS_PROVIDER_ERROR"
    });

    const timedOut = createService({
      analyze: vi.fn().mockRejectedValue(
        new AiProviderError("timeout", "internal timeout")
      )
    });
    const timeoutAccepted = await timedOut.service.request(
      failureRunDetail.run.id,
      false,
      config
    );
    await timedOut.service.execute(timeoutAccepted.analysisId, config);
    const failed = await timedOut.service.get(timeoutAccepted.analysisId);
    expect(failed).toMatchObject({
      status: "failed",
      errorCode: "AI_ANALYSIS_TIMEOUT"
    });
    expect(failed.errorMessage).not.toContain("internal timeout");
  });

  it("존재하지 않는 근거를 반환한 AI 결과를 저장하지 않는다", async () => {
    const invalid = {
      ...validAnalysisResult,
      confirmedFacts: [
        {
          ...validAnalysisResult.confirmedFacts[0]!,
          evidenceIds: ["invented-evidence"]
        }
      ]
    };
    const { service } = createService({
      analyze: vi.fn().mockResolvedValue({
        response: toProviderResponse(invalid),
        usage: {}
      })
    });
    const accepted = await service.request(failureRunDetail.run.id, false, config);
    await service.execute(accepted.analysisId, config);
    const failed = await service.get(accepted.analysisId);
    expect(failed).toMatchObject({
      status: "failed",
      errorCode: "AI_ANALYSIS_EVIDENCE_INVALID"
    });
    expect(failed.result).toBeUndefined();
  });
});
