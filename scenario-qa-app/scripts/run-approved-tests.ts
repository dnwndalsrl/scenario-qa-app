import { runApprovedTests } from "../packages/qa-engine/approved-tests";
import { analysisIdFromArgs } from "./analysis-id";

runApprovedTests(analysisIdFromArgs(process.argv.slice(2))).catch((error) => { console.error(error instanceof Error ? error.message : "Approved test runner failed"); process.exitCode = 1; });
