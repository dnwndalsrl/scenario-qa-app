import { describe, expect, it, vi } from "vitest";
import { dispatchAnalysisWorkflow, dispatchApprovedTestsWorkflow, dispatchScenarioEditWorkflow, dispatchSuiteTestsWorkflow, dispatchTestWorkflow, dispatchUiAuditWorkflow, getWorkflowStatus, latestWorkflowRun, workflowDispatchUrl } from "./github-actions.service";
const config = { token: "secret-token", owner: "acme", repo: "probe", workflowId: "run-qa-analysis.yml", ref: "main" };

describe("GitHub Actions dispatch", () => {
  it("sends the full-analysis workflow mode", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await dispatchAnalysisWorkflow(id, config, fetcher);
    expect(fetcher).toHaveBeenCalledWith(workflowDispatchUrl(config), expect.objectContaining({ method: "POST", body: JSON.stringify({ ref: "main", inputs: { analysis_id: id, mode: "analysis", test_id: "", test_run_id: "" } }) }));
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).not.toContain("target_url");
  });
  it("sends identifiers for one test run", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const analysisId = "123e4567-e89b-42d3-a456-426614174000";
    const testId = "223e4567-e89b-42d3-a456-426614174000";
    const runId = "323e4567-e89b-42d3-a456-426614174000";
    await dispatchTestWorkflow(analysisId, testId, runId, config, fetcher);
    expect(fetcher).toHaveBeenCalledWith(workflowDispatchUrl(config), expect.objectContaining({ body: JSON.stringify({ ref: "main", inputs: { analysis_id: analysisId, mode: "single_test", test_id: testId, test_run_id: runId } }) }));
  });
  it("sends the approved scenario workflow mode", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const analysisId = "123e4567-e89b-42d3-a456-426614174000";
    await dispatchApprovedTestsWorkflow(analysisId, config, fetcher);
    expect(fetcher).toHaveBeenCalledWith(workflowDispatchUrl(config), expect.objectContaining({ body: JSON.stringify({ ref: "main", inputs: { analysis_id: analysisId, mode: "approved_tests", test_id: "", test_run_id: "" } }) }));
  });
  it("sends the suite workflow mode", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const analysisId = "123e4567-e89b-42d3-a456-426614174000";
    await dispatchSuiteTestsWorkflow(analysisId, config, fetcher);
    expect(fetcher).toHaveBeenCalledWith(workflowDispatchUrl(config), expect.objectContaining({ body: JSON.stringify({ ref: "main", inputs: { analysis_id: analysisId, mode: "suite_tests", test_id: "", test_run_id: "" } }) }));
  });
  it("sends identifiers for a natural-language scenario edit", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const analysisId = "123e4567-e89b-42d3-a456-426614174000";
    const testId = "223e4567-e89b-42d3-a456-426614174000";
    const requestId = "323e4567-e89b-42d3-a456-426614174000";
    await dispatchScenarioEditWorkflow(analysisId, testId, requestId, config, fetcher);
    expect(fetcher).toHaveBeenCalledWith(workflowDispatchUrl(config), expect.objectContaining({ body: JSON.stringify({ ref: "main", inputs: { analysis_id: analysisId, mode: "scenario_edit", test_id: testId, test_run_id: requestId } }) }));
  });
  it("sends the UI audit workflow mode", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const auditId = "123e4567-e89b-42d3-a456-426614174000";
    await dispatchUiAuditWorkflow(auditId, config, fetcher);
    expect(fetcher).toHaveBeenCalledWith(workflowDispatchUrl(config), expect.objectContaining({ body: JSON.stringify({ ref: "main", inputs: { analysis_id: auditId, mode: "ui_audit", test_id: "", test_run_id: "" } }) }));
  });
  it("does not include the token in an upstream error", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("bad", { status: 403 }));
    await expect(dispatchAnalysisWorkflow("123e4567-e89b-42d3-a456-426614174000", config, fetcher)).rejects.not.toThrow("secret-token");
  });
  it("rejects non UUID input before network access", async () => {
    const fetcher = vi.fn(); await expect(dispatchAnalysisWorkflow("../../secret", config, fetcher)).rejects.toThrow("Invalid analysis id"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns the latest regression workflow run without exposing credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ workflow_runs: [{ status: "completed", conclusion: "success", run_number: 7, html_url: "https://github.com/acme/probe/actions/runs/7", created_at: "2026-08-20T00:00:00Z", updated_at: "2026-08-20T00:02:00Z", head_sha: "abc123" }] }), { status: 200 }));
    await expect(latestWorkflowRun(config, "production-regression.yml", fetcher)).resolves.toEqual({ status: "completed", conclusion: "success", runNumber: 7, url: "https://github.com/acme/probe/actions/runs/7", createdAt: "2026-08-20T00:00:00Z", updatedAt: "2026-08-20T00:02:00Z", commitSha: "abc123" });
    expect(fetcher).toHaveBeenCalledWith("https://api.github.com/repos/acme/probe/actions/workflows/production-regression.yml/runs?branch=main&per_page=1", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer secret-token" }) }));
  });
  it("checks whether the configured workflow is active without dispatching it", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "QA", state: "active", html_url: "https://github.com/acme/probe/actions" }), { status: 200 }));
    await expect(getWorkflowStatus(config, fetcher)).resolves.toEqual({ name: "QA", state: "active", url: "https://github.com/acme/probe/actions" });
    expect(fetcher).toHaveBeenCalledWith("https://api.github.com/repos/acme/probe/actions/workflows/run-qa-analysis.yml", expect.not.objectContaining({ method: "POST" }));
  });
});
