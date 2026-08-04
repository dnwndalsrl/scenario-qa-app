import type { AiPageAnalysis } from "../../../shared/types/analysis";
import { getRecord, saveRecord } from "../../storage/json-store";
export const pageAnalysisRepository = { get: (id: string) => getRecord<AiPageAnalysis>("page-analyses", id), save: (value: AiPageAnalysis) => saveRecord("page-analyses", value) };
