import type { AiSiteAnalysis } from "../../../shared/types/analysis";
import { getRecord, saveRecord } from "../../storage/json-store";
export const siteLevelAnalysisRepository = { get: (id: string) => getRecord<AiSiteAnalysis>("site-analyses", id), save: (value: AiSiteAnalysis) => saveRecord("site-analyses", value) };
