import type { GeneratedTestScenario, PageSnapshot } from "../../../../shared/types/analysis";
import { ensureScenarioAssertions } from "../../../analysis/services/scenario-verification.service";
import { buildAnalysisPreflight, inspectTargetReachability } from "../../../services/analysis-preflight.service";
import { getOwnedAnalysis } from "../../../services/analysis-records.service";
import { getWorkflowStatus, githubConfigFromRuntime } from "../../../services/github-actions.service";
import { requireUser } from "../../../services/supabase.service";

export default defineEventHandler(async (event) => {
  const { client } = await requireUser(event);
  const analysisId = getRouterParam(event, "analysisId") || "";
  const analysis = await getOwnedAnalysis(client, analysisId);
  if (analysis.process_stage !== "scenario_review") throw createError({ statusCode: 409, statusMessage: "시나리오 검토 단계에서만 실행 전 점검을 할 수 있습니다." });

  const github = githubConfigFromRuntime(useRuntimeConfig(event));
  const runnerConfigured = Boolean(github.token && github.owner && github.repo && github.workflowId && github.ref);
  const [testsResult, snapshotsResult, activeRunsResult, target, workflow] = await Promise.all([
    client.from("generated_tests").select("payload,safety_level,auto_executable").eq("analysis_id", analysisId).order("created_at"),
    client.from("page_snapshots").select("page_id,payload").eq("analysis_id", analysisId),
    client.from("test_runs").select("id", { count: "exact", head: true }).eq("analysis_id", analysisId).in("status", ["pending", "running"]),
    inspectTargetReachability(String(analysis.normalized_url)),
    runnerConfigured ? getWorkflowStatus(github).catch(() => undefined) : Promise.resolve(undefined)
  ]);
  if (testsResult.error) throw createError({ statusCode: 500, statusMessage: "사전 점검에서 시나리오를 조회하지 못했습니다." });
  if (snapshotsResult.error) throw createError({ statusCode: 500, statusMessage: "사전 점검에서 페이지 스냅샷을 조회하지 못했습니다." });
  if (activeRunsResult.error) throw createError({ statusCode: 500, statusMessage: "사전 점검에서 실행 상태를 조회하지 못했습니다." });

  const rows = testsResult.data || [];
  const snapshots = snapshotsResult.data || [];
  let readyScenarioCount = 0;
  for (const row of rows) {
    if (row.safety_level !== "safe" || !row.auto_executable) continue;
    const stored = row.payload as GeneratedTestScenario;
    const snapshot = snapshots.find((item) => item.page_id === (stored.pageId || null))?.payload as PageSnapshot | undefined;
    if (!snapshot) continue;
    try {
      const scenario = ensureScenarioAssertions(stored, snapshot);
      if (scenario.safetyLevel === "safe" && scenario.autoExecutable && scenario.steps.some((step) => step.action.startsWith("assert_"))) readyScenarioCount++;
    } catch { /* 실행 API가 동일 시나리오를 제외하므로 사전 점검에서도 준비되지 않은 것으로 계산합니다. */ }
  }

  return buildAnalysisPreflight({
    target,
    snapshotCount: snapshots.length,
    totalScenarioCount: rows.length,
    readyScenarioCount,
    activeRunCount: activeRunsResult.count || 0,
    runnerConfigured,
    runnerReachable: Boolean(workflow),
    runnerActive: workflow?.state === "active"
  });
});
