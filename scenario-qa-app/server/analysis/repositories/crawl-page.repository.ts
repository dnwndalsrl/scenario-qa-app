import type { CrawledPage } from "../../../shared/types/analysis";
import { getRecord, listRecords, saveRecord } from "../../storage/json-store";

export const crawlPageRepository = {
  get: (id: string) => getRecord<CrawledPage>("crawl-pages", id),
  save: (value: CrawledPage) => saveRecord("crawl-pages", value),
  async getMany(ids: string[]) { return (await Promise.all(ids.map((id) => this.get(id)))).filter((value): value is CrawledPage => Boolean(value)); },
  async listByAnalysis(analysisId: string) { return (await listRecords<CrawledPage>("crawl-pages")).filter((value) => value.analysisId === analysisId); },
  async update(id: string, patch: Partial<CrawledPage>) { const current = await this.get(id); return current ? this.save({ ...current, ...patch, id }) : undefined; }
};
