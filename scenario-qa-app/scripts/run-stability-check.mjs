import { writeFile } from "node:fs/promises";

const apiBaseUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:3106";
const projectId = process.env.QA_PROJECT_ID ?? "project-local-login";
const repetitions = Number.parseInt(process.env.QA_REPETITIONS ?? "10", 10);
const scenarios = [
  "scenario-login-success",
  "scenario-login-failure",
  "scenario-items-list"
];
const terminalStatuses = new Set(["success", "failed", "blocked", "error"]);
const results = [];

for (const scenarioId of scenarios) {
  for (let iteration = 1; iteration <= repetitions; iteration += 1) {
    const accepted = await requestJson(`${apiBaseUrl}/api/test-runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, scenarioId })
    });
    const runId = accepted.data.runId;
    let detail;
    for (let poll = 0; poll < 600; poll += 1) {
      detail = await requestJson(`${apiBaseUrl}/api/test-runs/${runId}`);
      if (terminalStatuses.has(detail.data.run.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!detail || !terminalStatuses.has(detail.data.run.status)) {
      throw new Error(`Run ${runId} did not finish before the polling deadline.`);
    }
    results.push({
      scenario: scenarioId,
      iteration,
      runId,
      status: detail.data.run.status,
      errorCode: detail.data.run.errorCode ?? null,
      durationMs: detail.data.run.durationMs ?? null,
      consoleLogs: detail.data.result?.consoleLogs.length ?? 0,
      networkErrors: detail.data.result?.networkErrors.length ?? 0,
      browser: detail.data.result?.browserInfo?.version ?? null
    });
  }
}

const summary = scenarios.map((scenario) => {
  const runs = results.filter((result) => result.scenario === scenario);
  const successCount = runs.filter((result) => result.status === "success").length;
  const durations = runs.map((result) => result.durationMs).filter(Number.isFinite);
  return {
    scenario,
    total: runs.length,
    successCount,
    successRate: Number(((successCount / runs.length) * 100).toFixed(1)),
    statusCounts: Object.fromEntries(
      ["success", "failed", "blocked", "error"].map((status) => [
        status,
        runs.filter((result) => result.status === status).length
      ])
    ),
    averageDurationMs:
      durations.length === 0
        ? null
        : Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(1)),
    errorCodes: [...new Set(runs.map((result) => result.errorCode).filter(Boolean))]
  };
});

await writeFile("readiness-stability-final.json", `${JSON.stringify(results, null, 2)}\n`, "utf8");
await writeFile("readiness-stability-summary.json", `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.table(summary);

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok || payload.success !== true) {
    throw new Error(`${response.status} ${payload.error?.code ?? "API_ERROR"}`);
  }
  return payload;
}
