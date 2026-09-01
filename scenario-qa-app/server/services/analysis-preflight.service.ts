import type { AnalysisPreflight, PreflightCheck } from "../../shared/types/preflight";
import { validateTargetUrl } from "../security/url-validator";

interface PreflightInput {
  target: PreflightCheck;
  snapshotCount: number;
  totalScenarioCount: number;
  readyScenarioCount: number;
  activeRunCount: number;
  runnerConfigured: boolean;
  runnerReachable: boolean;
  runnerActive: boolean;
}

function overall(checks: PreflightCheck[]): AnalysisPreflight["status"] {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  return checks.some((check) => check.status === "warning") ? "warning" : "ready";
}

export function buildAnalysisPreflight(input: PreflightInput, now = new Date()): AnalysisPreflight {
  const excludedScenarioCount = Math.max(0, input.totalScenarioCount - input.readyScenarioCount);
  const checks: PreflightCheck[] = [
    input.target,
    input.snapshotCount
      ? { id: "storage", label: "분석 데이터", status: "ready", message: `테스트 대상 페이지 스냅샷 ${input.snapshotCount}개를 확인했습니다.` }
      : { id: "storage", label: "분석 데이터", status: "blocked", message: "테스트 대상 페이지 스냅샷이 없어 실행할 수 없습니다." },
    input.readyScenarioCount === 0
      ? { id: "scenarios", label: "확정 시나리오", status: "blocked", message: "예상 결과를 검증할 수 있는 안전한 시나리오가 없습니다." }
      : excludedScenarioCount
        ? { id: "scenarios", label: "확정 시나리오", status: "warning", message: `자동 실행 가능 ${input.readyScenarioCount}개 · 수동 검토 또는 제외 ${excludedScenarioCount}개입니다.` }
        : { id: "scenarios", label: "확정 시나리오", status: "ready", message: `예상 결과가 포함된 안전한 시나리오 ${input.readyScenarioCount}개를 실행할 수 있습니다.` },
    input.activeRunCount
      ? { id: "active_runs", label: "중복 실행", status: "blocked", message: "이미 실행 중인 테스트가 있습니다. 완료 후 다시 점검해 주세요." }
      : { id: "active_runs", label: "중복 실행", status: "ready", message: "현재 진행 중인 중복 테스트가 없습니다." },
    !input.runnerConfigured
      ? { id: "runner", label: "실행기 연결", status: "blocked", message: "GitHub Actions 실행기 설정이 완성되지 않았습니다." }
      : !input.runnerReachable
        ? { id: "runner", label: "실행기 연결", status: "blocked", message: "GitHub Actions 실행기 상태를 확인하지 못했습니다." }
        : !input.runnerActive
          ? { id: "runner", label: "실행기 연결", status: "blocked", message: "GitHub Actions 워크플로가 비활성 상태입니다." }
          : { id: "runner", label: "실행기 연결", status: "ready", message: "GitHub Actions 워크플로가 실행 가능한 상태입니다." }
  ];
  const status = overall(checks);
  return { status, canRun: status !== "blocked", checkedAt: now.toISOString(), readyScenarioCount: input.readyScenarioCount, excludedScenarioCount, checks };
}

export async function inspectTargetReachability(targetUrl: string, fetcher: typeof fetch = fetch): Promise<PreflightCheck> {
  try {
    const normalizedUrl = await validateTargetUrl(targetUrl);
    const response = await fetcher(normalizedUrl, {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(6000),
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Probe-QA-Preflight/1.0" }
    });
    await response.body?.cancel().catch(() => undefined);
    if (response.status >= 200 && response.status < 300) return { id: "target", label: "대상 페이지", status: "ready", message: `페이지가 응답했습니다. HTTP ${response.status}` };
    if (response.status >= 300 && response.status < 400) return { id: "target", label: "대상 페이지", status: "warning", message: `리디렉션 응답을 확인했습니다. 실행기에서 최종 이동을 다시 검증합니다. HTTP ${response.status}` };
    if ([401, 403, 429].includes(response.status)) return { id: "target", label: "대상 페이지", status: "warning", message: `인증·접근 제한 응답입니다. 실행기 위치에서는 결과가 달라질 수 있습니다. HTTP ${response.status}` };
    return { id: "target", label: "대상 페이지", status: "warning", message: `페이지 응답 상태를 확인해 주세요. HTTP ${response.status}` };
  } catch {
    return { id: "target", label: "대상 페이지", status: "warning", message: "사전 요청에 응답하지 않았습니다. 실행기 위치에서 다시 접속을 시도합니다." };
  }
}
