import type { SiteAnalysis } from "../../../shared/types/analysis";
import { getRecord, listRecords, saveRecord } from "../../storage/json-store";

export const analysisRepository = {
  get: (id: string) => getRecord<SiteAnalysis>("analyses", id),
  save: (value: SiteAnalysis) => saveRecord("analyses", value),
  async list(): Promise<SiteAnalysis[]> { return (await listRecords<SiteAnalysis>("analyses")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
  async update(id: string, patch: Partial<SiteAnalysis>): Promise<SiteAnalysis | undefined> {
    const current = await this.get(id); if (!current) return undefined;
    return this.save({ ...current, ...patch, id, updatedAt: new Date().toISOString() });
  }
};
