import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisDetail, SiteAnalysis, SiteAnalysisOptions } from "../../shared/types/analysis";
import { buildCurrentSummary } from "../analysis/services/analysis-summary.service";
import { ensureScenarioAssertions } from "../analysis/services/scenario-verification.service";

const activeStatuses = new Set(["queued", "dispatching", "dispatched", "running", "cancel_requested"]);

export function rowToAnalysis(row: Record<string, any>): SiteAnalysis {
  const options: SiteAnalysisOptions = {
    mode: row.mode, testMode: "read_only", autoRunSafeTests: row.auto_run_safe_tests,
    viewport: { width: 1440, height: 900 }, timeoutMs: 30000, maxPages: row.max_pages,
    maxDepth: row.max_depth, includeQueryUrls: false, respectNoFollow: true
  };
  const status = row.status === "queued" || row.status === "dispatching" || row.status === "dispatched" ? "pending"
    : row.status === "running" || row.status === "cancel_requested" ? "launching_browser"
    : row.status === "cancelled" || row.status === "dispatch_failed" ? "failed" : row.status;
  return {
    id: row.id, targetUrl: row.target_url, normalizedUrl: row.normalized_url, status, processStage: row.process_stage || "page_analysis", scenariosApprovedAt: row.scenarios_approved_at || undefined, authenticationEnabled: Boolean(row.authentication_enabled),
    progress: row.progress, currentMessage: row.current_message, options, pageIds: [], pageAnalysisIds: [], generatedTestIds: [], testRunIds: [],
    summary: row.summary || undefined, error: row.error || undefined, createdAt: row.created_at,
    startedAt: row.started_at || undefined, completedAt: row.completed_at || undefined, updatedAt: row.updated_at
  } as SiteAnalysis;
}

export async function getOwnedAnalysis(client: SupabaseClient, id: string) {
  const { data, error } = await client.from("analyses").select("*").eq("id", id).single();
  if (error || !data) throw createError({ statusCode: error?.code === "PGRST116" ? 404 : 500, statusMessage: error?.code === "PGRST116" ? "분석을 찾을 수 없습니다." : "분석 조회에 실패했습니다." });
  return data as Record<string, any>;
}

export async function getAnalysisDetailFromSupabase(client: SupabaseClient, id: string): Promise<AnalysisDetail> {
  const row = await getOwnedAnalysis(client, id);
  const [pagesResult, testsResult, runsResult, summaryResult, documentResult] = await Promise.all([
    client.from("analysis_pages").select("payload").eq("analysis_id", id).order("created_at"),
    client.from("generated_tests").select("payload").eq("analysis_id", id).order("created_at"),
    client.from("test_runs").select("payload").eq("analysis_id", id).order("created_at"),
    client.from("analysis_summaries").select("payload").eq("analysis_id", id).maybeSingle(),
    client.from("requirement_documents").select("payload,status,file_name,error").eq("analysis_id", id).maybeSingle()
  ]);
  const payload = (summaryResult.data?.payload || {}) as Partial<AnalysisDetail>;
  const storedTests = (testsResult.data || []).map((item: any) => item.payload);
  const generatedTests = payload.snapshot
    ? storedTests.map((test) => ensureScenarioAssertions(test, payload.snapshot!))
    : storedTests;
  const testRuns = (runsResult.data || []).map((item: any) => item.payload);
  const storedSummary = row.summary || payload.analysis?.summary;
  const currentSummary = row.mode === "single_page" && payload.snapshot && payload.pageAnalysis
    ? buildCurrentSummary(payload.snapshot, payload.pageAnalysis, generatedTests, testRuns)
    : storedSummary;
  const pages = (pagesResult.data || []).map((item: any) => {
    const page = item.payload as AnalysisDetail["pages"][number];
    return {
      ...page,
      generatedTests: generatedTests.filter((test) => test.pageId === page.page.id),
      testRuns: testRuns.filter((run) => run.pageId === page.page.id)
    };
  });
  return {
    analysis: { ...rowToAnalysis(row), ...(payload.analysis || {}), id: row.id, status: rowToAnalysis(row).status, progress: row.progress, currentMessage: row.current_message, error: row.error || payload.analysis?.error, summary: currentSummary },
    snapshot: payload.snapshot, pageAnalysis: payload.pageAnalysis,
    generatedTests,
    testRuns,
    pages,
    documentAnalysis: documentResult.data ? {
      fileName: documentResult.data.file_name, requirements: [], limitations: [], missingInformation: [],
      ...(documentResult.data.payload || {}), status: documentResult.data.status, error: documentResult.data.error || undefined
    } : undefined,
    siteMap: payload.siteMap, siteAnalysis: payload.siteAnalysis, testDeduplication: payload.testDeduplication
  };
}

export function isActiveStatus(status: string): boolean { return activeStatuses.has(status); }
