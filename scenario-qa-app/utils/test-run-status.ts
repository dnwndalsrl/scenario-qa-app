import type { AutomatedTestRun, TestRunStatus } from "~/shared/types/analysis";
import { uiLabel } from "~/utils/ui-label";

export function testRunStatusLabel(run: AutomatedTestRun): string {
  if (run.status === "pending") {
    return { queued: "실행 대기", dispatching: "전송 중", retrying: "재시도 대기", dispatched: "실행 대기", exhausted: "복구 실패" }[run.dispatch?.status || "queued"];
  }
  return uiLabel(run.status);
}

export function testRunStatusTone(run: AutomatedTestRun): TestRunStatus {
  return run.dispatch?.status === "exhausted" ? "error" : run.status;
}
