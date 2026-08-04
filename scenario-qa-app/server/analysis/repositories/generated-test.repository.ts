import type { GeneratedTestScenario } from "../../../shared/types/analysis";
import { getRecord, saveRecord } from "../../storage/json-store";
export const generatedTestRepository = {
  get: (id: string) => getRecord<GeneratedTestScenario>("generated-tests", id), save: (value: GeneratedTestScenario) => saveRecord("generated-tests", value),
  async getMany(ids: string[]) { return (await Promise.all(ids.map((id) => this.get(id)))).filter((value): value is GeneratedTestScenario => Boolean(value)); }
};
