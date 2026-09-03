import { runUiAudit } from "../packages/ui-audit/index";
import { analysisIdFromArgs } from "./analysis-id";
const auditId=analysisIdFromArgs(process.argv.slice(2));
runUiAudit(auditId).catch((error)=>{ console.error(error instanceof Error?error.message:"UI audit runner failed"); process.exitCode=1; });
