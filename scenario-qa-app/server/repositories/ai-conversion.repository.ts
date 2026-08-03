import type { AiScenarioConversion } from "../../shared/types/ai-scenario.js";
import { getStorageFile } from "../utils/file-storage.js";
import { JsonArrayRepository } from "./json-array.repository.js";

export class AiConversionRepository extends JsonArrayRepository<AiScenarioConversion> {
  constructor() {
    super(getStorageFile("ai-conversions.json"));
  }

  async listByProject(projectId: string): Promise<AiScenarioConversion[]> {
    return (await this.list())
      .filter((conversion) => conversion.projectId === projectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async patch(
    conversionId: string,
    changes: Partial<AiScenarioConversion>
  ): Promise<AiScenarioConversion | null> {
    const current = await this.findById(conversionId);
    if (current === null) {
      return null;
    }
    return this.update(conversionId, {
      ...current,
      ...changes,
      id: current.id,
      projectId: current.projectId,
      createdAt: current.createdAt
    });
  }

  async linkScenario(
    conversionId: string,
    scenarioId: string,
    updatedAt: string
  ): Promise<AiScenarioConversion | null> {
    return this.patch(conversionId, {
      scenarioId,
      status: "saved",
      updatedAt
    });
  }

  async deleteByProject(projectId: string): Promise<AiScenarioConversion[]> {
    return this.deleteWhere(
      (conversion) => conversion.projectId === projectId
    );
  }

  async deleteFailedBefore(cutoffIso: string): Promise<AiScenarioConversion[]> {
    return this.deleteWhere(
      (conversion) =>
        conversion.status === "failed" &&
        conversion.updatedAt.localeCompare(cutoffIso) < 0
    );
  }
}
