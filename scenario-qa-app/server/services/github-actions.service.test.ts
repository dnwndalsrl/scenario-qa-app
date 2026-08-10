import { describe, expect, it, vi } from "vitest";
import { dispatchAnalysisWorkflow, dispatchTestWorkflow, workflowDispatchUrl } from "./github-actions.service";
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
  it("does not include the token in an upstream error", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("bad", { status: 403 }));
    await expect(dispatchAnalysisWorkflow("123e4567-e89b-42d3-a456-426614174000", config, fetcher)).rejects.not.toThrow("secret-token");
  });
  it("rejects non UUID input before network access", async () => {
    const fetcher = vi.fn(); await expect(dispatchAnalysisWorkflow("../../secret", config, fetcher)).rejects.toThrow("Invalid analysis id"); expect(fetcher).not.toHaveBeenCalled();
  });
});
