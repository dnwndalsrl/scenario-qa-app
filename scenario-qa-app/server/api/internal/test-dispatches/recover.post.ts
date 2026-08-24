import { githubConfigFromRuntime } from "../../../services/github-actions.service";
import { createServiceSupabaseClient } from "../../../services/supabase.service";
import { attemptTestRunDispatch, expireStaleDispatchedRun, isDispatchDue, type TestDispatchRow } from "../../../services/test-dispatch-queue.service";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const secret = String(config.dispatchRecoverySecret || "");
  if (!secret) throw createError({ statusCode: 503, statusMessage: "실행 복구 기능이 설정되지 않았습니다." });
  if (getHeader(event, "authorization") !== `Bearer ${secret}`) {
    throw createError({ statusCode: 401, statusMessage: "실행 복구 요청을 인증할 수 없습니다." });
  }

  const client = createServiceSupabaseClient(event);
  const { data, error } = await client.from("test_runs")
    .select("id,analysis_id,test_id,payload").eq("status", "pending").order("created_at").limit(100);
  if (error) throw createError({ statusCode: 500, statusMessage: "복구할 테스트 실행을 조회하지 못했습니다." });

  const now = new Date();
  const counts = { examined: data?.length || 0, dispatched: 0, retrying: 0, exhausted: 0, expired: 0 };
  for (const raw of data || []) {
    const row = raw as TestDispatchRow;
    if (isDispatchDue(row.payload, now)) {
      const status = await attemptTestRunDispatch(client, row, githubConfigFromRuntime(config), now);
      if (status === "dispatched") counts.dispatched += 1;
      else if (status === "retrying") counts.retrying += 1;
      else if (status === "exhausted") counts.exhausted += 1;
    } else if (await expireStaleDispatchedRun(client, row, now)) counts.expired += 1;
  }

  return { ok: true, ...counts };
});
