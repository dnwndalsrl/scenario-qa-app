import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TestStatus } from "./constants/test-status.js";
import { runScenario } from "./runner/scenario-runner.js";
import { resolveEnvironmentPlaceholders } from "./utils/environment.js";
import { readJsonFile } from "./utils/file.js";
import { parseTestScenario } from "./utils/scenario-parser.js";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(sourceDirectory, "..");

async function main(): Promise<void> {
  const scenarioPath = path.resolve(
    projectRoot,
    process.env.SCENARIO_PATH ?? "src/scenarios/login-success.json"
  );
  const rawScenario = await readJsonFile(scenarioPath);
  const environmentResolution = resolveEnvironmentPlaceholders(
    rawScenario,
    process.env
  );
  const scenario = parseTestScenario(environmentResolution.value);
  const output = await runScenario(scenario, {
    projectRoot,
    artifactsDirectory: path.join(projectRoot, "artifacts"),
    headless: parseHeadless(process.env.HEADLESS),
    sensitiveValues: environmentResolution.sensitiveValues
  });

  printSummary(output.result, output.resultPath);
  if (output.result.status !== TestStatus.SUCCESS) {
    process.exitCode = 1;
  }
}

function printSummary(
  result: Awaited<ReturnType<typeof runScenario>>["result"],
  resultPath: string
): void {
  console.log(`\n시나리오: ${result.scenarioName}\n`);
  console.log(`전체 단계: ${result.totalSteps}`);
  console.log(`성공: ${result.successCount}`);
  console.log(`실패: ${result.failedCount}`);
  console.log(`중단: ${result.blockedCount}`);
  console.log(`오류: ${result.errorCount}\n`);
  console.log(`최종 상태: ${result.status}`);
  console.log(`결과 파일: ${resultPath}`);
}

function parseHeadless(value: string | undefined): boolean {
  if (value === undefined || value.trim().length === 0) {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error("HEADLESS 환경변수는 true 또는 false여야 합니다.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`시나리오 실행을 시작하지 못했습니다: ${message}`);
  process.exitCode = 1;
});
