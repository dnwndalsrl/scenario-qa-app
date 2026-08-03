import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ProductionReadinessCheck, ProductionReadinessReport, ReadinessIssue, ScenarioStabilityResult } from "../../shared/types/readiness.js";
import type { ProjectRepository } from "../repositories/project.repository.js";
import type { ScenarioRepository } from "../repositories/scenario.repository.js";
import type { TestRunRepository } from "../repositories/test-run.repository.js";
import type { TestScheduleRepository } from "../repositories/test-schedule.repository.js";
import type { TestScheduleExecutionRepository } from "../repositories/test-schedule-execution.repository.js";
import type { NotificationDeliveryRepository } from "../repositories/notification-delivery.repository.js";
import type { TestRunService } from "../services/test-run.service.js";
import { AppError } from "../utils/api.js";
import { getStorageRoot } from "../utils/file-storage.js";
import { assertSafeTestTargetUrl } from "../security/test-target-url-policy.js";

const COMPLETED = new Set(["success", "failed", "blocked", "error"]);

export class ProductionReadinessService {
  constructor(private readonly projects: ProjectRepository, private readonly scenarios: ScenarioRepository,
    private readonly runs: TestRunRepository, private readonly schedules: TestScheduleRepository,
    private readonly executions: TestScheduleExecutionRepository, private readonly deliveries: NotificationDeliveryRepository,
    private readonly runService: TestRunService) {}

  async generate(projectId: string): Promise<ProductionReadinessReport> {
    const project = await this.projects.findById(projectId); if (project === null) throw new AppError(404, "PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
    const [scenarios, runs, schedules, executions, deliveries] = await Promise.all([
      this.scenarios.listByProject(projectId), this.runs.listByProject(projectId), this.schedules.listByProject(projectId), this.executions.listByProject(projectId), this.deliveries.list()
    ]);
    const detailRuns = scenarios.flatMap((scenario) =>
      runs
        .filter((run) => run.scenarioId === scenario.id && COMPLETED.has(run.status))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 10)
    );
    const details = await Promise.all(detailRuns.map((run) => this.runService.getDetail(run.id).catch(() => ({ run, result: null }))));
    const stabilityResults = scenarios.map((scenario): ScenarioStabilityResult => {
      const selected = details.filter((item) => item.run.scenarioId === scenario.id).sort((a, b) => b.run.createdAt.localeCompare(a.run.createdAt)).slice(0, 10);
      const durations = selected.flatMap((item) => item.run.durationMs === undefined ? [] : [item.run.durationMs]);
      const stepFailures = new Map<string, number>(); for (const detail of selected) for (const step of detail.result?.steps ?? []) if (step.status !== "success") stepFailures.set(step.stepName, (stepFailures.get(step.stepName) ?? 0) + 1);
      const successCount = selected.filter((item) => item.run.status === "success").length; const nonSuccess = selected.length - successCount;
      return { scenarioId: scenario.id, scenarioName: scenario.name, executionCount: selected.length, successCount,
        failedCount: selected.filter((item) => item.run.status === "failed").length, errorCount: selected.filter((item) => item.run.status === "error").length,
        blockedCount: selected.filter((item) => item.run.status === "blocked").length, stabilityRate: selected.length === 0 ? 0 : successCount / selected.length * 100,
        ...(durations.length === 0 ? {} : { averageDurationMs: durations.reduce((a, b) => a + b, 0) / durations.length, minDurationMs: Math.min(...durations), maxDurationMs: Math.max(...durations) }),
        intermittentFailureCount: successCount > 0 && nonSuccess > 0 ? nonSuccess : 0,
        commonFailureSteps: [...stepFailures].map(([stepName, count]) => ({ stepName, count })).sort((a, b) => b.count - a.count).slice(0, 5) };
    });
    const issues: ReadinessIssue[] = []; const checks: ProductionReadinessCheck[] = [];
    try { assertSafeTestTargetUrl(project.baseUrl); checks.push(check("project_url", "프로젝트 URL 검증", "passed", "URL 정책을 통과했습니다.", [new URL(project.baseUrl).origin])); }
    catch { checks.push(check("project_url", "프로젝트 URL 검증", "failed", "현재 URL이 테스트 대상 보안 정책을 통과하지 못했습니다.")); issues.push(issue("security-url", "security", "critical", "안전하지 않은 테스트 대상 URL", "프로젝트 URL이 SSRF 방지 정책에 위배됩니다.")); }
    const targetHost = new URL(project.baseUrl).hostname.toLowerCase();
    const localTarget = ["localhost", "127.0.0.1", "::1"].includes(targetHost) || project.environmentName.toLowerCase() === "local";
    checks.push(check("target_environment", "실제 대상 환경 검증", localTarget ? "warning" : "passed", localTarget ? "로컬 샘플 대상에서 검증했습니다. 실제 staging/업무 대상 URL과 계정으로 별도 승인 검증이 필요합니다." : `${project.environmentName} 환경을 대상으로 검증했습니다.`));
    const accountReady = hasEnv("TEST_LOGIN_ID") && hasEnv("TEST_LOGIN_PASSWORD"); checks.push(check("test_account", "테스트 계정 등록", accountReady ? "passed" : "failed", accountReady ? "테스트 계정 환경변수가 설정되어 있습니다." : "TEST_LOGIN_ID와 TEST_LOGIN_PASSWORD가 필요합니다."));
    const coreCount = scenarios.length; checks.push(check("core_scenarios", "핵심 시나리오 등록", coreCount >= 3 ? "passed" : "failed", `${coreCount}개 시나리오가 등록되어 있습니다.`));
    const unstable = scenarios.flatMap((scenario) => scenario.steps.filter((step) => step.target?.strategy === "css" && (/nth-child|__[a-z0-9]{5,}|.{120,}/i.test(step.target.value))).map((step) => `${scenario.name}: ${step.name}`));
    checks.push(check("selector_stability", "selector 안정성", unstable.length === 0 ? "passed" : "warning", unstable.length === 0 ? "불안정 패턴을 발견하지 못했습니다." : `${unstable.length}개 selector를 검토해야 합니다.`, unstable));
    const tested = stabilityResults.filter((item) => item.executionCount >= 10); const minimum = tested.length === 0 ? 0 : Math.min(...tested.map((item) => item.stabilityRate));
    checks.push(check("repeat_stability", "반복 테스트 완료", tested.length >= Math.min(3, scenarios.length) && minimum >= 90 ? (minimum >= 95 ? "passed" : "warning") : "failed", `${tested.length}개 시나리오가 10회 이상 실행되었고 최저 안정성은 ${minimum.toFixed(1)}%입니다.`));
    if (minimum < 90 || tested.length < Math.min(3, scenarios.length)) issues.push(issue("stability-insufficient", "stability", "high", "반복 안정성 기준 미달", "핵심 시나리오 3개 이상을 각각 10회 실행하고 90% 이상을 확인해야 합니다."));
    const sensitiveFindings = await scanSensitiveValues(getStorageRoot()); checks.push(check("sensitive_data", "민감정보 점검", sensitiveFindings.length === 0 ? "passed" : "failed", sensitiveFindings.length === 0 ? "현재 환경의 알려진 민감값이 JSON 결과에서 발견되지 않았습니다." : `${sensitiveFindings.length}개 파일에서 민감값 후보가 발견되었습니다.`, sensitiveFindings.map((item) => path.basename(item))));
    if (sensitiveFindings.length) issues.push(issue("sensitive-storage", "security", "critical", "저장 파일 민감정보 노출", "현재 환경의 알려진 민감값이 저장 파일에서 발견되었습니다."));
    const completedExecution = executions.some((item) => item.status === "completed" && item.suiteRunId !== undefined); checks.push(check("schedule", "예약 실행 확인", schedules.length > 0 && completedExecution ? "passed" : "warning", `${schedules.length}개 예약, ${executions.length}개 실행 기록이 있습니다.`));
    const projectExecutionIds = new Set(executions.map((item) => item.id)); const projectDeliveries = deliveries.filter((item) => projectExecutionIds.has(item.scheduleExecutionId));
    checks.push(check("notification", "알림 연결 확인", projectDeliveries.some((item) => item.status === "sent") ? "passed" : "warning", `${projectDeliveries.length}개 전달 기록 중 ${projectDeliveries.filter((item) => item.status === "sent").length}개가 전송 완료입니다.`));
    const externalChannels = new Set(projectDeliveries.filter((item) => item.channel === "email" || item.channel === "slack").map((item) => item.channel));
    checks.push(check("external_notifications", "외부 알림 검증", externalChannels.size > 0 ? "passed" : "warning", externalChannels.size > 0 ? `${[...externalChannels].join(", ")} 채널 전달 기록이 있습니다.` : "인앱 알림은 검증했지만 이메일/Slack은 실제 자격 증명이 없어 전송하지 않았습니다."));
    const active = runs.filter((item) => ["pending", "running"].includes(item.status)); checks.push(check("restart_recovery", "서버 재시작 복구", active.length === 0 ? "passed" : "failed", active.length === 0 ? "고아 실행 상태가 없습니다." : `${active.length}개 실행이 미종료 상태입니다.`));
    const storageBytes = await directorySize(getStorageRoot()); const maxBytes = positive(process.env.TEST_MAX_ARTIFACT_STORAGE_MB, 1024) * 1024 * 1024;
    checks.push(check("storage_capacity", "storage 용량", storageBytes < maxBytes ? "passed" : "warning", `${(storageBytes / 1024 / 1024).toFixed(2)}MB / ${(maxBytes / 1024 / 1024).toFixed(0)}MB`));
    const buildExists = await exists(path.resolve(process.cwd(), ".output/server/index.mjs")); checks.push(check("deployment", "배포 환경", buildExists ? "passed" : "warning", buildExists ? "프로덕션 서버 번들이 존재합니다." : "현재 작업 폴더에서 프로덕션 번들을 찾지 못했습니다."));
    const allIssues = issues; const hasCritical = allIssues.some((item) => item.severity === "critical" || item.severity === "high"); const hasFailed = checks.some((item) => item.status === "failed"); const hasWarning = checks.some((item) => item.status === "warning");
    const status = hasCritical || hasFailed ? "not_ready" : hasWarning ? "ready_with_warnings" : "ready";
    return { projectId, status, checks, stabilityResults, securityIssues: issues.filter((item) => item.category === "security"), reliabilityIssues: issues.filter((item) => ["stability", "scheduler", "notification"].includes(item.category)), performanceIssues: [], storageIssues: issues.filter((item) => item.category === "storage"), deploymentIssues: issues.filter((item) => item.category === "deployment"), recommendations: checks.filter((item) => item.status !== "passed").map((item) => ({ priority: item.status === "failed" ? "high" as const : "medium" as const, title: item.title, description: item.description })), generatedAt: new Date().toISOString() };
  }
}

function check(key: string, title: string, status: ProductionReadinessCheck["status"], description: string, evidence?: string[]): ProductionReadinessCheck { return { key, title, status, description, ...(evidence === undefined || evidence.length === 0 ? {} : { evidence }) }; }
function issue(id: string, category: ReadinessIssue["category"], severity: ReadinessIssue["severity"], title: string, description: string): ReadinessIssue { return { id, category, severity, title, description, reproductionSteps: ["준비도 보고서를 다시 생성합니다."], expectedResult: "검사가 통과해야 합니다.", actualResult: description, relatedFiles: [], status: "open" }; }
function hasEnv(name: string): boolean { return (process.env[name] ?? "").trim().length > 0; }
function positive(value: string | undefined, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
async function exists(file: string): Promise<boolean> { try { return (await stat(file)).isFile(); } catch { return false; } }
async function directorySize(directory: string): Promise<number> { let total = 0; for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) { const target = path.join(directory, entry.name); total += entry.isDirectory() ? await directorySize(target) : (await stat(target)).size; } return total; }
async function scanSensitiveValues(directory: string): Promise<string[]> { const values = Object.entries(process.env).filter(([key, value]) => value !== undefined && value.length >= 4 && /(PASSWORD|TOKEN|SECRET|COOKIE|AUTHORIZATION|API_KEY|PRIVATE_KEY|LOGIN_ID|ADMIN_ID)/i.test(key)).map(([, value]) => value as string); if (values.length === 0) return []; const files = await listJson(directory); const found: string[] = []; for (const file of files) { const content = await readFile(file, "utf8").catch(() => ""); if (values.some((value) => content.includes(value))) found.push(file); } return found; }
async function listJson(directory: string): Promise<string[]> { const result: string[] = []; for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) { const target = path.join(directory, entry.name); if (entry.isDirectory()) result.push(...await listJson(target)); else if (entry.name.endsWith(".json")) result.push(target); } return result; }
