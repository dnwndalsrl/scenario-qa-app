import { createServiceSupabaseClient } from "./supabase.service";
export async function recoverStaleAnalyses(): Promise<void> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await createServiceSupabaseClient().from("analyses").update({
    status: "failed", progress: 100, current_message: "실행 제한 시간을 초과해 종료되었습니다.",
    error: { code: "RUNNER_STALE", message: "15분 이상 상태 갱신이 없어 중단된 작업으로 처리했습니다." }, completed_at: new Date().toISOString()
  }).in("status", ["queued", "dispatching", "dispatched", "running", "cancel_requested"]).lt("updated_at", cutoff);
}
