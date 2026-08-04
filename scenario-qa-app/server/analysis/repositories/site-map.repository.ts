import type { SiteMap } from "../../../shared/types/analysis";
import { getRecord, saveRecord } from "../../storage/json-store";
export const siteMapRepository = { get: (id: string) => getRecord<SiteMap>("site-maps", id), save: (value: SiteMap) => saveRecord("site-maps", value) };
