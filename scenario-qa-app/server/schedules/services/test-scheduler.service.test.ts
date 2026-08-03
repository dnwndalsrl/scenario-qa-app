import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TestSuiteRun } from "../../../shared/types/test-suite.js";
import { AppNotificationService } from "../../notifications/services/app-notification.service.js";
import { NotificationDeliveryService } from "../../notifications/services/notification-delivery.service.js";
import { AppNotificationRepository } from "../../repositories/app-notification.repository.js";
import { NotificationDeliveryRepository } from "../../repositories/notification-delivery.repository.js";
import { ProjectRepository } from "../../repositories/project.repository.js";
import { TestScheduleExecutionRepository } from "../../repositories/test-schedule-execution.repository.js";
import { TestScheduleRepository } from "../../repositories/test-schedule.repository.js";
import { TestSuiteRepository } from "../../repositories/test-suite.repository.js";
import { TestSuiteRunItemRepository } from "../../repositories/test-suite-run-item.repository.js";
import { TestSuiteRunRepository } from "../../repositories/test-suite-run.repository.js";
import type { TestRunComparisonService } from "../../comparisons/services/test-run-comparison.service.js";
import type { TestSuiteRunService } from "../../services/test-suite-run.service.js";
import { TestSchedulerService } from "./test-scheduler.service.js";

describe("TestSchedulerService integration", () => {
  let storageRoot: string;
  const previousStorageRoot = process.env.NUXT_STORAGE_ROOT;

  beforeAll(async () => {
    storageRoot = await mkdtemp(path.join(tmpdir(), "scenario-qa-scheduler-"));
    process.env.NUXT_STORAGE_ROOT = storageRoot;
  });

  afterAll(async () => {
    if (previousStorageRoot === undefined) delete process.env.NUXT_STORAGE_ROOT;
    else process.env.NUXT_STORAGE_ROOT = previousStorageRoot;
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("detects a due schedule, reuses suite execution, and records an app delivery", async () => {
    const projectRepository = new ProjectRepository();
    const suiteRepository = new TestSuiteRepository();
    const suiteRunRepository = new TestSuiteRunRepository();
    const suiteRunItemRepository = new TestSuiteRunItemRepository();
    const scheduleRepository = new TestScheduleRepository();
    const executionRepository = new TestScheduleExecutionRepository();
    const notificationRepository = new AppNotificationRepository();
    const deliveryRepository = new NotificationDeliveryRepository();
    await projectRepository.create({
      id: "project-integration", name: "통합 테스트", baseUrl: "http://127.0.0.1:3000",
      environmentName: "test", defaultTimeout: 10000, stopOnFailure: true,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
    });
    await suiteRepository.create({
      id: "suite-integration", projectId: "project-integration", name: "예약 스위트",
      status: "active", executionPolicy: "stop_on_failure", items: [],
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
    });
    await scheduleRepository.create({
      id: "schedule-integration", projectId: "project-integration", suiteId: "suite-integration",
      name: "매일 실행", status: "active", scheduleType: "daily", timezone: "UTC",
      scheduleConfig: { type: "daily", hour: 9, minute: 0 }, concurrencyPolicy: "skip",
      missedRunPolicy: "run_once",
      notificationPolicy: {
        notifyOnSuccess: true, notifyOnFailure: true, notifyOnPartialSuccess: true,
        notifyOnRegression: true, notifyOnScheduleError: true, channels: ["in_app"]
      },
      emailTargets: [], nextRunAt: "2026-08-03T08:59:50.000Z",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
    });

    const suiteGateway = {
      async requestRun(request: { trigger?: TestSuiteRun["trigger"]; scheduleTriggerInfo?: TestSuiteRun["scheduleTriggerInfo"] }) {
        const run: TestSuiteRun = {
          id: "suite-run-integration", suiteId: "suite-integration", projectId: "project-integration",
          status: "pending", executionPolicy: "stop_on_failure",
          ...(request.trigger === undefined ? {} : { trigger: request.trigger }),
          ...(request.scheduleTriggerInfo === undefined ? {} : { scheduleTriggerInfo: request.scheduleTriggerInfo }),
          suiteSnapshot: { suiteName: "예약 스위트", executionPolicy: "stop_on_failure", items: [], createdAt: "2026-08-03T09:00:00.000Z" },
          totalItems: 0, executableItems: 0, completedItems: 0, successCount: 0, failedCount: 0,
          blockedCount: 0, skippedCount: 0, errorCount: 0, progressRate: 100, version: "v1",
          createdAt: "2026-08-03T09:00:00.000Z", updatedAt: "2026-08-03T09:00:00.000Z"
        };
        await suiteRunRepository.create(run);
        return run;
      },
      async executeRun(id: string) {
        await suiteRunRepository.patch(id, { status: "success", finishedAt: "2026-08-03T09:00:01.000Z", updatedAt: "2026-08-03T09:00:01.000Z" });
      }
    } as unknown as TestSuiteRunService;
    const comparison = {} as TestRunComparisonService;
    const appNotifications = new AppNotificationService(notificationRepository);
    const delivery = new NotificationDeliveryService(
      deliveryRepository, appNotifications,
      {
        appBaseUrl: "http://localhost:3100", emailProvider: "disabled", emailFrom: "",
        smtpHost: "", smtpPort: 587, smtpSecure: false, smtpUser: "", smtpPassword: "",
        encryptionKey: "", maxRetryCount: 3, retryDelaysMs: [0, 0, 0]
      },
      scheduleRepository, executionRepository, async () => undefined
    );
    const scheduler = new TestSchedulerService(
      scheduleRepository, executionRepository, suiteRepository, suiteRunRepository,
      suiteRunItemRepository, suiteGateway, comparison, delivery,
      { enabled: true, tickIntervalMs: 1000, defaultTimezone: "UTC", maxPerSuite: 10, maxPerProject: 100, minIntervalMinutes: 15, version: "v1" }
    );

    await scheduler.tick("2026-08-03T09:00:00.000Z");

    const executions = await executionRepository.listBySchedule("schedule-integration");
    expect(executions[0]).toMatchObject({ status: "completed", suiteRunStatus: "success", trigger: "schedule" });
    expect((await suiteRunRepository.findById("suite-run-integration"))?.trigger).toBe("schedule");
    expect(await notificationRepository.listByProject("project-integration")).toHaveLength(1);
    expect(await deliveryRepository.listByExecution(executions[0]!.id)).toEqual([
      expect.objectContaining({ channel: "in_app", status: "sent" })
    ]);
  });
});
