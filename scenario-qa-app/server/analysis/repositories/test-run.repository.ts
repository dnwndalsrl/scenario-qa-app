import type { AutomatedTestRun } from "../../../shared/types/analysis";
import { getRecord, saveRecord } from "../../storage/json-store";
export const automatedTestRunRepository = {
  get: (id: string) => getRecord<AutomatedTestRun>("test-runs", id), save: (value: AutomatedTestRun) => saveRecord("test-runs", value),
  async getMany(ids: string[]) { return (await Promise.all(ids.map((id) => this.get(id)))).filter((value): value is AutomatedTestRun => Boolean(value)); }
};
