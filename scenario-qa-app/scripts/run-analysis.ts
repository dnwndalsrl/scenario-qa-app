import { runQaAnalysis } from "../packages/qa-engine/index";
import { analysisIdFromArgs } from "./analysis-id";

const analysisId = analysisIdFromArgs(process.argv.slice(2));
runQaAnalysis(analysisId).catch((error) => { console.error(error instanceof Error ? error.message : "QA runner failed"); process.exitCode = 1; });
