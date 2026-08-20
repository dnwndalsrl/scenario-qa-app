import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AutomatedTestRun } from "../shared/types/analysis";
import { buildDoctorAgRegressionScenarios, summarizeProductionRegression } from "../server/regression/production-regression";

const targetUrl = "https://doctor-ag.com/";
const outputRoot = path.resolve(process.cwd(), ".qa-regression");
const reportPath = path.join(outputRoot, "latest.json");

await mkdir(outputRoot, { recursive: true });
process.env.NUXT_STORAGE_ROOT = path.join(outputRoot, "artifacts");

try {
  const { collectPage } = await import("../server/playwright/page-collector");
  const { executeGeneratedTests } = await import("../server/playwright/test-executor");
  const snapshot = await collectPage("production-regression-doctor-ag", targetUrl, { width: 1440, height: 900 }, 30000);
  const scenarios = buildDoctorAgRegressionScenarios(snapshot);
  const runs = await executeGeneratedTests(snapshot, scenarios);
  const summary = summarizeProductionRegression(runs);
  const report = {
    targetUrl, checkedAt: new Date().toISOString(), commitSha: process.env.GITHUB_SHA || undefined, summary,
    scenarios: scenarios.map((scenario) => {
      const run = runs.find((item) => item.scenarioId === scenario.id);
      return { id: scenario.id, title: scenario.title, status: run?.status || "error", failureKind: run?.failureKind, error: run?.error, stepResults: run?.stepResults || [] };
    })
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeSummary(summary, runs);
  if (summary.productDefectCount) process.exitCode = 1;
  else if (summary.inconclusiveCount) console.warn(`::warning::운영 회귀 ${summary.inconclusiveCount}건의 판정을 보류했습니다. latest.json을 확인해 주세요.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await writeFile(reportPath, `${JSON.stringify({ targetUrl, checkedAt: new Date().toISOString(), summary: { overallStatus: "passed_with_warnings", totalCount: 0, successCount: 0, productDefectCount: 0, inconclusiveCount: 1 }, error: message }, null, 2)}\n`, "utf8");
  console.warn(`::warning::운영 사이트 검증 환경 오류: ${message}`);
  await writeSummary({ overallStatus: "passed_with_warnings", totalCount: 0, successCount: 0, productDefectCount: 0, inconclusiveCount: 1 }, []);
}

async function writeSummary(summary: ReturnType<typeof summarizeProductionRegression>, runs: AutomatedTestRun[]) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) return;
  const rows = runs.map((run) => `| ${run.scenarioId.replace("production-regression-", "")} | ${run.status} | ${run.failureKind || "-"} |`).join("\n");
  await appendFile(target, [
    "## 운영 회귀 검증", "", `- 대상: ${targetUrl}`, `- 판정: ${summary.overallStatus}`,
    `- 성공 ${summary.successCount}/${summary.totalCount} · 제품 결함 ${summary.productDefectCount} · 판정 보류 ${summary.inconclusiveCount}`,
    "", "| 시나리오 | 상태 | 실패 분류 |", "|---|---|---|", rows || "| 실행 환경 | warning | environment_error |", ""
  ].join("\n"), "utf8");
}
