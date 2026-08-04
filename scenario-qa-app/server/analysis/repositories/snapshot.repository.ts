import type { PageSnapshot } from "../../../shared/types/analysis";
import { getRecord, saveRecord } from "../../storage/json-store";
export const snapshotRepository = { get: (id: string) => getRecord<PageSnapshot>("snapshots", id), save: (value: PageSnapshot) => saveRecord("snapshots", value) };
