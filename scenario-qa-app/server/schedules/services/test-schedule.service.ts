import type { SchedulePreviewResult, TestSchedule, TestScheduleDetail, TestScheduleExecutionDetail, TestScheduleInput } from "../../../shared/types/test-schedule.js";
import type { ProjectRepository } from "../../repositories/project.repository.js";
import type { TestScheduleExecutionRepository } from "../../repositories/test-schedule-execution.repository.js";
import type { TestScheduleRepository } from "../../repositories/test-schedule.repository.js";
import type { TestSuiteRepository } from "../../repositories/test-suite.repository.js";
import type { NotificationDeliveryRepository } from "../../repositories/notification-delivery.repository.js";
import { encryptSecret, maskEmail, validateSlackWebhookUrl } from "../../notifications/utils/secret.js";
import { AppError } from "../../utils/api.js";
import { nowIso } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import type { StoredTestSchedule } from "../types/storage.js";
import { calculateNextRunAt, previewSchedule } from "../utils/next-run-calculator.js";
import type { TestScheduleRuntimeConfig } from "../utils/schedule-config.js";

export class TestScheduleService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly suiteRepository: TestSuiteRepository,
    private readonly scheduleRepository: TestScheduleRepository,
    private readonly executionRepository: TestScheduleExecutionRepository,
    private readonly deliveryRepository: NotificationDeliveryRepository,
    private readonly config: TestScheduleRuntimeConfig,
    private readonly encryptionKey: string
  ) {}

  async list(projectId: string, suiteId?: string): Promise<TestSchedule[]> {
    await this.requireProject(projectId);
    const schedules = await this.scheduleRepository.listByProject(projectId);
    return Promise.all(schedules
      .filter((schedule) => suiteId === undefined || schedule.suiteId === suiteId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((schedule) => this.toPublic(schedule)));
  }

  async getDetail(projectId: string, scheduleId: string): Promise<TestScheduleDetail> {
    const stored = await this.requireSchedule(projectId, scheduleId);
    return { schedule: await this.toPublic(stored), executions: await this.executionRepository.listBySchedule(scheduleId) };
  }

  async getExecutionDetail(projectId: string, scheduleId: string, executionId: string): Promise<TestScheduleExecutionDetail> {
    await this.requireSchedule(projectId, scheduleId);
    const execution = await this.executionRepository.findById(executionId);
    if (execution === null || execution.scheduleId !== scheduleId) {
      throw new AppError(404, "TEST_SCHEDULE_EXECUTION_NOT_FOUND", "예약 실행 기록을 찾을 수 없습니다.");
    }
    return { execution, deliveries: await this.deliveryRepository.listByExecution(executionId) };
  }

  async getExecutionById(executionId: string): Promise<TestScheduleExecutionDetail> {
    const execution = await this.executionRepository.findById(executionId);
    if (execution === null) throw new AppError(404, "TEST_SCHEDULE_EXECUTION_NOT_FOUND", "예약 실행 기록을 찾을 수 없습니다.");
    return { execution, deliveries: await this.deliveryRepository.listByExecution(executionId) };
  }

  preview(input: Pick<TestScheduleInput, "scheduleConfig" | "timezone">): SchedulePreviewResult {
    return previewSchedule(input.scheduleConfig, input.timezone);
  }

  async create(projectId: string, input: TestScheduleInput): Promise<TestSchedule> {
    await this.requireProject(projectId);
    await this.requireSuite(projectId, input.suiteId);
    this.assertEmailTargets(input, input.emailTargets);
    const projectSchedules = await this.scheduleRepository.listByProject(projectId);
    if (projectSchedules.length >= this.config.maxPerProject) throw limitError(`프로젝트에는 최대 ${this.config.maxPerProject}개의 예약을 만들 수 있습니다.`);
    if (projectSchedules.filter((item) => item.suiteId === input.suiteId).length >= this.config.maxPerSuite) throw limitError(`테스트 스위트에는 최대 ${this.config.maxPerSuite}개의 예약을 만들 수 있습니다.`);
    const timestamp = nowIso();
    const nextRunAt = calculateNextRunAt(input.scheduleConfig, input.timezone, timestamp);
    if (input.status === "active" && nextRunAt === undefined) throw noFutureRun();
    const slackWebhookEncrypted = this.resolveSlackSecret(input, undefined);
    const stored: StoredTestSchedule = {
      id: createId("schedule"), projectId, suiteId: input.suiteId, name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
      status: input.status, scheduleType: input.scheduleType, timezone: input.timezone,
      scheduleConfig: input.scheduleConfig, concurrencyPolicy: input.concurrencyPolicy,
      missedRunPolicy: input.missedRunPolicy, notificationPolicy: input.notificationPolicy,
      emailTargets: input.emailTargets,
      ...(slackWebhookEncrypted === undefined ? {} : { slackWebhookEncrypted }),
      ...(input.status === "active" && nextRunAt !== undefined ? { nextRunAt } : {}),
      createdAt: timestamp, updatedAt: timestamp
    };
    await this.scheduleRepository.create(stored);
    return this.toPublic(stored);
  }

  async update(projectId: string, scheduleId: string, input: TestScheduleInput): Promise<TestSchedule> {
    const current = await this.requireSchedule(projectId, scheduleId);
    await this.requireSuite(projectId, input.suiteId);
    if (input.suiteId !== current.suiteId && (await this.scheduleRepository.listBySuite(input.suiteId)).length >= this.config.maxPerSuite) throw limitError(`테스트 스위트에는 최대 ${this.config.maxPerSuite}개의 예약을 만들 수 있습니다.`);
    const timestamp = nowIso();
    const nextRunAt = calculateNextRunAt(input.scheduleConfig, input.timezone, timestamp);
    if (input.status === "active" && nextRunAt === undefined) throw noFutureRun();
    const slackWebhookEncrypted = this.resolveSlackSecret(input, current.slackWebhookEncrypted);
    const emailTargets = input.emailTargets.length === 0 ? current.emailTargets : input.emailTargets;
    this.assertEmailTargets(input, emailTargets);
    const updated: StoredTestSchedule = {
      ...current, suiteId: input.suiteId, name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
      status: input.status, scheduleType: input.scheduleType, timezone: input.timezone,
      scheduleConfig: input.scheduleConfig, concurrencyPolicy: input.concurrencyPolicy,
      missedRunPolicy: input.missedRunPolicy, notificationPolicy: input.notificationPolicy,
      emailTargets,
      ...(slackWebhookEncrypted === undefined ? {} : { slackWebhookEncrypted }),
      ...(input.status === "active" && nextRunAt !== undefined ? { nextRunAt } : {}), updatedAt: timestamp
    };
    if (input.description === undefined) delete updated.description;
    if (input.status === "inactive") delete updated.nextRunAt;
    if (slackWebhookEncrypted === undefined) delete updated.slackWebhookEncrypted;
    const saved = await this.scheduleRepository.update(scheduleId, updated);
    if (saved === null) throw notFound();
    return this.toPublic(saved);
  }

  async setStatus(projectId: string, scheduleId: string, status: "active" | "inactive"): Promise<TestSchedule> {
    const current = await this.requireSchedule(projectId, scheduleId);
    const updated: StoredTestSchedule = { ...current, status, updatedAt: nowIso() };
    if (status === "active") {
      const nextRunAt = calculateNextRunAt(current.scheduleConfig, current.timezone);
      if (nextRunAt === undefined) throw noFutureRun();
      updated.nextRunAt = nextRunAt;
    } else delete updated.nextRunAt;
    const saved = await this.scheduleRepository.update(scheduleId, updated);
    if (saved === null) throw notFound();
    return this.toPublic(saved);
  }

  async remove(projectId: string, scheduleId: string): Promise<void> {
    const current = await this.requireSchedule(projectId, scheduleId);
    const timestamp = nowIso();
    const deleted: StoredTestSchedule = { ...current, status: "inactive", deletedAt: timestamp, updatedAt: timestamp };
    delete deleted.nextRunAt;
    delete deleted.slackWebhookEncrypted;
    await this.scheduleRepository.update(scheduleId, deleted);
  }

  async getStored(projectId: string, scheduleId: string): Promise<StoredTestSchedule> {
    return this.requireSchedule(projectId, scheduleId);
  }

  async toPublic(stored: StoredTestSchedule): Promise<TestSchedule> {
    const suite = await this.suiteRepository.findById(stored.suiteId);
    return {
      id: stored.id, projectId: stored.projectId, suiteId: stored.suiteId,
      ...(suite === null ? {} : { suiteName: suite.name }), name: stored.name,
      ...(stored.description === undefined ? {} : { description: stored.description }),
      status: stored.status, scheduleType: stored.scheduleType, timezone: stored.timezone,
      scheduleConfig: stored.scheduleConfig, concurrencyPolicy: stored.concurrencyPolicy,
      missedRunPolicy: stored.missedRunPolicy, notificationPolicy: stored.notificationPolicy,
      emailTargets: stored.emailTargets.map((target) => ({ emailMasked: maskEmail(target.email), enabled: target.enabled })),
      slackConfigured: stored.slackWebhookEncrypted !== undefined,
      ...(stored.nextRunAt === undefined ? {} : { nextRunAt: stored.nextRunAt }),
      ...(stored.lastRunAt === undefined ? {} : { lastRunAt: stored.lastRunAt }),
      ...(stored.lastRunStatus === undefined ? {} : { lastRunStatus: stored.lastRunStatus }),
      ...(stored.lastScheduleExecutionId === undefined ? {} : { lastScheduleExecutionId: stored.lastScheduleExecutionId }),
      createdAt: stored.createdAt, updatedAt: stored.updatedAt,
      ...(stored.deletedAt === undefined ? {} : { deletedAt: stored.deletedAt })
    };
  }

  private resolveSlackSecret(input: TestScheduleInput, existing: string | undefined): string | undefined {
    if (!input.notificationPolicy.channels.includes("slack")) return undefined;
    if (input.slackWebhookUrl !== undefined) return encryptSecret(validateSlackWebhookUrl(input.slackWebhookUrl), this.encryptionKey);
    if (existing !== undefined) return existing;
    throw new AppError(400, "NOTIFICATION_TARGET_REQUIRED", "Slack 알림을 사용하려면 Webhook URL이 필요합니다.");
  }

  private assertEmailTargets(input: TestScheduleInput, targets: TestScheduleInput["emailTargets"]): void {
    if (input.notificationPolicy.channels.includes("email") && !targets.some((target) => target.enabled)) {
      throw new AppError(400, "NOTIFICATION_TARGET_REQUIRED", "이메일 알림 수신자를 한 명 이상 설정해 주세요.");
    }
  }

  private async requireProject(projectId: string): Promise<void> {
    if (await this.projectRepository.findById(projectId) === null) throw new AppError(404, "PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  }
  private async requireSuite(projectId: string, suiteId: string): Promise<void> {
    const suite = await this.suiteRepository.findById(suiteId);
    if (suite === null) throw new AppError(404, "TEST_SUITE_NOT_FOUND", "테스트 스위트를 찾을 수 없습니다.");
    if (suite.projectId !== projectId) throw new AppError(409, "TEST_SUITE_PROJECT_MISMATCH", "테스트 스위트가 프로젝트에 속하지 않습니다.");
    if (suite.status !== "active") throw new AppError(409, "TEST_SUITE_INACTIVE", "활성 테스트 스위트만 예약할 수 있습니다.");
  }
  private async requireSchedule(projectId: string, scheduleId: string): Promise<StoredTestSchedule> {
    const schedule = await this.scheduleRepository.findById(scheduleId);
    if (schedule === null || schedule.deletedAt !== undefined) throw notFound();
    if (schedule.projectId !== projectId) throw new AppError(409, "TEST_SCHEDULE_PROJECT_MISMATCH", "예약이 프로젝트에 속하지 않습니다.");
    return schedule;
  }
}

function notFound(): AppError { return new AppError(404, "TEST_SCHEDULE_NOT_FOUND", "테스트 예약을 찾을 수 없습니다."); }
function limitError(message: string): AppError { return new AppError(409, "TEST_SCHEDULE_LIMIT_EXCEEDED", message); }
function noFutureRun(): AppError { return new AppError(400, "TEST_SCHEDULE_NO_FUTURE_RUN", "활성 예약에는 미래 실행 시각이 필요합니다."); }
