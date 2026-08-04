export interface GitHubDispatchConfig {
  token: string; owner: string; repo: string; workflowId: string; ref: string;
}

export function workflowDispatchUrl(config: GitHubDispatchConfig): string {
  for (const [name, value] of Object.entries(config)) if (!value) throw new Error(`GitHub Actions ${name} is not configured`);
  return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions/workflows/${encodeURIComponent(config.workflowId)}/dispatches`;
}

export async function dispatchAnalysisWorkflow(analysisId: string, config: GitHubDispatchConfig, fetcher: typeof fetch = fetch): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(analysisId)) throw new Error("Invalid analysis id");
  const response = await fetcher(workflowDispatchUrl(config), {
    method: "POST",
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${config.token}`, "x-github-api-version": "2022-11-28", "content-type": "application/json" },
    body: JSON.stringify({ ref: config.ref, inputs: { analysis_id: analysisId } })
  });
  if (!response.ok) throw new Error(`GitHub Actions dispatch failed (${response.status})`);
}

export function githubConfigFromRuntime(config: ReturnType<typeof useRuntimeConfig>): GitHubDispatchConfig {
  return {
    token: String(config.githubToken || ""), owner: String(config.githubOwner || ""), repo: String(config.githubRepo || ""),
    workflowId: String(config.githubWorkflowId || "run-qa-analysis.yml"), ref: String(config.githubWorkflowRef || "main")
  };
}
