export interface GitHubDispatchConfig {
  token: string; owner: string; repo: string; workflowId: string; ref: string;
}

export interface GitHubWorkflowRun {
  status: "queued" | "in_progress" | "completed";
  conclusion?: string;
  runNumber: number;
  url: string;
  createdAt: string;
  updatedAt: string;
  commitSha: string;
}

export function workflowDispatchUrl(config: GitHubDispatchConfig): string {
  for (const [name, value] of Object.entries(config)) if (!value) throw new Error(`GitHub Actions ${name} is not configured`);
  return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions/workflows/${encodeURIComponent(config.workflowId)}/dispatches`;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function dispatchWorkflow(inputs: Record<string, string>, config: GitHubDispatchConfig, fetcher: typeof fetch): Promise<void> {
  const response = await fetcher(workflowDispatchUrl(config), {
    method: "POST",
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${config.token}`, "x-github-api-version": "2022-11-28", "content-type": "application/json" },
    body: JSON.stringify({ ref: config.ref, inputs })
  });
  if (!response.ok) throw new Error(`GitHub Actions dispatch failed (${response.status})`);
}

export async function dispatchAnalysisWorkflow(analysisId: string, config: GitHubDispatchConfig, fetcher: typeof fetch = fetch): Promise<void> {
  if (!uuidPattern.test(analysisId)) throw new Error("Invalid analysis id");
  await dispatchWorkflow({ analysis_id: analysisId, mode: "analysis", test_id: "", test_run_id: "" }, config, fetcher);
}

export async function dispatchTestWorkflow(analysisId: string, testId: string, testRunId: string, config: GitHubDispatchConfig, fetcher: typeof fetch = fetch): Promise<void> {
  if (![analysisId, testId, testRunId].every((id) => uuidPattern.test(id))) throw new Error("Invalid test workflow id");
  await dispatchWorkflow({ analysis_id: analysisId, mode: "single_test", test_id: testId, test_run_id: testRunId }, config, fetcher);
}

export async function dispatchApprovedTestsWorkflow(analysisId: string, config: GitHubDispatchConfig, fetcher: typeof fetch = fetch): Promise<void> {
  if (!uuidPattern.test(analysisId)) throw new Error("Invalid analysis id");
  await dispatchWorkflow({ analysis_id: analysisId, mode: "approved_tests", test_id: "", test_run_id: "" }, config, fetcher);
}

export async function dispatchSuiteTestsWorkflow(analysisId: string, config: GitHubDispatchConfig, fetcher: typeof fetch = fetch): Promise<void> {
  if (!uuidPattern.test(analysisId)) throw new Error("Invalid analysis id");
  await dispatchWorkflow({ analysis_id: analysisId, mode: "suite_tests", test_id: "", test_run_id: "" }, config, fetcher);
}

export async function dispatchScenarioEditWorkflow(analysisId: string, testId: string, requestId: string, config: GitHubDispatchConfig, fetcher: typeof fetch = fetch): Promise<void> {
  if (![analysisId, testId, requestId].every((id) => uuidPattern.test(id))) throw new Error("Invalid scenario edit workflow id");
  await dispatchWorkflow({ analysis_id: analysisId, mode: "scenario_edit", test_id: testId, test_run_id: requestId }, config, fetcher);
}

export async function latestWorkflowRun(config: GitHubDispatchConfig, workflowId: string, fetcher: typeof fetch = fetch): Promise<GitHubWorkflowRun | undefined> {
  const base = workflowDispatchUrl({ ...config, workflowId }).replace(/\/dispatches$/, "/runs");
  const response = await fetcher(`${base}?branch=${encodeURIComponent(config.ref)}&per_page=1`, {
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${config.token}`, "x-github-api-version": "2022-11-28" }
  });
  if (!response.ok) throw new Error(`GitHub Actions run lookup failed (${response.status})`);
  const payload = await response.json() as { workflow_runs?: Array<Record<string, unknown>> };
  const run = payload.workflow_runs?.[0];
  if (!run) return undefined;
  return {
    status: run.status as GitHubWorkflowRun["status"], conclusion: typeof run.conclusion === "string" ? run.conclusion : undefined,
    runNumber: Number(run.run_number), url: String(run.html_url), createdAt: String(run.created_at), updatedAt: String(run.updated_at), commitSha: String(run.head_sha)
  };
}

export function githubConfigFromRuntime(config: ReturnType<typeof useRuntimeConfig>): GitHubDispatchConfig {
  return {
    token: String(config.githubToken || ""), owner: String(config.githubOwner || ""), repo: String(config.githubRepo || ""),
    workflowId: String(config.githubWorkflowId || "run-qa-analysis.yml"), ref: String(config.githubWorkflowRef || "main")
  };
}
