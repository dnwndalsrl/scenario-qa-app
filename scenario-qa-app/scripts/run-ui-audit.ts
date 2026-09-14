import { formatUiAuditDiagnostic, runUiAudit } from "../packages/ui-audit/index";
import { analysisIdFromArgs } from "./analysis-id";
const auditId = analysisIdFromArgs(process.argv.slice(2));
runUiAudit(auditId).catch((error) => { console.error(formatUiAuditDiagnostic(error, auditId)); process.exitCode = 1; });
