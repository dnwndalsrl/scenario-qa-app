import { writeFile } from "node:fs/promises";

const baseUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:3106";
const projectId = process.env.QA_PROJECT_ID ?? "project-local-login";
const runListPayload = await (await fetch(`${baseUrl}/api/test-runs?projectId=${projectId}`)).json();
const latestRunId = runListPayload.data?.[0]?.id;
const comparisonListPayload = await (await fetch(`${baseUrl}/api/projects/${projectId}/scenarios/scenario-login-success/comparisons`)).json();
const latestComparisonId = comparisonListPayload.data?.[0]?.id;
const endpoints = [
  ["dashboard", "/"],
  ["project_list", "/api/projects"],
  ["project_detail", `/api/projects/${projectId}`],
  ["scenario_list", `/api/projects/${projectId}/scenarios`],
  ["run_history", `/api/test-runs?projectId=${projectId}`],
  ...(latestRunId ? [["run_detail", `/api/test-runs/${latestRunId}`]] : []),
  ...(latestComparisonId ? [["comparison_result", `/api/test-run-comparisons/${latestComparisonId}`]] : []),
  ["suite_list", `/api/projects/${projectId}/test-suites`],
  ["schedule_list", `/api/projects/${projectId}/test-schedules`],
  ["notification_list", `/api/notifications?projectId=${projectId}`],
  ["analytics_summary", `/api/projects/${projectId}/analytics/summary?startDate=2026-07-01&endDate=2026-08-03&timezone=Asia%2FSeoul&trigger=all`],
  ["analytics_timeseries", `/api/projects/${projectId}/analytics/timeseries?startDate=2026-07-01&endDate=2026-08-03&timezone=Asia%2FSeoul&trigger=all`],
  ["readiness", `/api/projects/${projectId}/readiness`]
];
const samplesPerEndpoint = 5;
const results = [];

for (const [name, route] of endpoints) {
  const samples = [];
  for (let index = 0; index < samplesPerEndpoint; index += 1) {
    const started = performance.now();
    const response = await fetch(`${baseUrl}${route}`);
    const body = await response.text();
    samples.push({
      status: response.status,
      durationMs: Number((performance.now() - started).toFixed(1)),
      bytes: Buffer.byteLength(body),
      recordCount: estimateRecordCount(body)
    });
  }
  const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
  results.push({
    name,
    route,
    samples: samplesPerEndpoint,
    statusCodes: [...new Set(samples.map((sample) => sample.status))],
    medianDurationMs: durations[Math.floor(durations.length / 2)],
    maxDurationMs: Math.max(...durations),
    averageBytes: Math.round(samples.reduce((sum, sample) => sum + sample.bytes, 0) / samples.length),
    recordCount: samples[0]?.recordCount ?? null
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  environment: "local readiness target",
  concurrency: 1,
  results,
  slowest: [...results].sort((a, b) => b.maxDurationMs - a.maxDurationMs)[0]
};
await writeFile("readiness-performance.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.table(results);

function estimateRecordCount(body) {
  try {
    const payload = JSON.parse(body);
    const data = payload.data;
    if (Array.isArray(data)) return data.length;
    if (Array.isArray(data?.items)) return data.items.length;
    if (Array.isArray(data?.runs)) return data.runs.length;
    if (Array.isArray(data?.points)) return data.points.length;
    if (Array.isArray(data?.stabilityResults)) return data.stabilityResults.length;
    if (Number.isFinite(data?.metrics?.completedRuns)) return data.metrics.completedRuns;
    return data == null ? 0 : 1;
  } catch {
    return null;
  }
}
