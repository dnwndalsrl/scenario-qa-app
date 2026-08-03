import type { AiFailureAnalysis } from "../../shared/types/ai-failure-analysis.js";
import { getStorageFile } from "../utils/file-storage.js";
import { JsonArrayRepository } from "./json-array.repository.js";

export class AiFailureAnalysisRepository extends JsonArrayRepository<AiFailureAnalysis> {
  constructor() {
    super(getStorageFile("ai-failure-analyses.json"));
  }

  async listByRun(runId: string): Promise<AiFailureAnalysis[]> {
    return (await this.list())
      .filter((analysis) => analysis.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findCompletedByFingerprint(
    runId: string,
    inputFingerprint: string
  ): Promise<AiFailureAnalysis | null> {
    return (
      (await this.listByRun(runId)).find(
        (analysis) =>
          analysis.status === "completed" &&
          analysis.inputFingerprint === inputFingerprint
      ) ?? null
    );
  }

  async findActiveByRun(runId: string): Promise<AiFailureAnalysis | null> {
    return (
      (await this.listByRun(runId)).find(
        (analysis) =>
          analysis.status === "pending" || analysis.status === "processing"
      ) ?? null
    );
  }

  async patch(
    analysisId: string,
    changes: Partial<AiFailureAnalysis>
  ): Promise<AiFailureAnalysis | null> {
    const current = await this.findById(analysisId);
    if (current === null) {
      return null;
    }
    return this.update(analysisId, {
      ...current,
      ...changes,
      id: current.id,
      runId: current.runId,
      projectId: current.projectId,
      scenarioId: current.scenarioId,
      createdAt: current.createdAt
    });
  }

  async deleteByProject(projectId: string): Promise<AiFailureAnalysis[]> {
    return this.deleteWhere((analysis) => analysis.projectId === projectId);
  }

  async deleteByScenario(scenarioId: string): Promise<AiFailureAnalysis[]> {
    return this.deleteWhere((analysis) => analysis.scenarioId === scenarioId);
  }
}

