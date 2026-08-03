import type { AiConversionRepository } from "../repositories/ai-conversion.repository.js";
import type { AiFailureAnalysisRepository } from "../repositories/ai-failure-analysis.repository.js";
import type { NotificationDeliveryRepository } from "../repositories/notification-delivery.repository.js";
import type { TestRunComparisonRepository } from "../repositories/test-run-comparison.repository.js";
import type { TestRunRepository } from "../repositories/test-run.repository.js";
import type { TestScheduleExecutionRepository } from "../repositories/test-schedule-execution.repository.js";
import type { TestSuiteRunItemRepository } from "../repositories/test-suite-run-item.repository.js";
import type { TestSuiteRunRepository } from "../repositories/test-suite-run.repository.js";
import { nowIso } from "../utils/date.js";

export interface RecoverySummary {
  testRuns: number; suiteRuns: number; suiteItems: number; scheduleExecutions: number;
  comparisons: number; aiAnalyses: number; aiConversions: number; notificationDeliveries: number;
}

export class OperationalRecoveryService {
  constructor(
    private readonly testRuns: TestRunRepository,
    private readonly suiteRuns: TestSuiteRunRepository,
    private readonly suiteItems: TestSuiteRunItemRepository,
    private readonly executions: TestScheduleExecutionRepository,
    private readonly comparisons: TestRunComparisonRepository,
    private readonly aiAnalyses: AiFailureAnalysisRepository,
    private readonly aiConversions: AiConversionRepository,
    private readonly deliveries: NotificationDeliveryRepository
  ) {}

  async recoverInterruptedWork(): Promise<RecoverySummary> {
    const timestamp = nowIso();
    const summary: RecoverySummary = { testRuns: 0, suiteRuns: 0, suiteItems: 0, scheduleExecutions: 0, comparisons: 0, aiAnalyses: 0, aiConversions: 0, notificationDeliveries: 0 };
    for (const run of await this.testRuns.list()) if (["pending", "running"].includes(run.status)) {
      await this.testRuns.update(run.id, { ...run, status: "error", finishedAt: timestamp, durationMs: elapsed(run.startedAt ?? run.createdAt, timestamp), errorCount: Math.max(1, run.errorCount), errorCode: "TEST_RUN_INTERRUPTED", errorMessage: "서버 재시작으로 테스트 실행이 중단되었습니다." }); summary.testRuns += 1;
    }
    for (const run of await this.suiteRuns.list()) if (["pending", "running"].includes(run.status)) {
      await this.suiteRuns.patch(run.id, { status: "error", finishedAt: timestamp, durationMs: elapsed(run.startedAt ?? run.createdAt, timestamp), errorCode: "TEST_SUITE_RUN_INTERRUPTED", errorMessage: "서버 재시작으로 스위트 실행이 중단되었습니다.", updatedAt: timestamp }); summary.suiteRuns += 1;
    }
    for (const item of await this.suiteItems.list()) if (["pending", "running"].includes(item.status)) {
      await this.suiteItems.patch(item.id, { status: "error", finishedAt: timestamp, errorCode: "TEST_SUITE_ITEM_INTERRUPTED", errorMessage: "서버 재시작으로 스위트 항목 실행이 중단되었습니다.", updatedAt: timestamp }); summary.suiteItems += 1;
    }
    for (const execution of await this.executions.list()) if (["detected", "running"].includes(execution.status)) {
      await this.executions.patch(execution.id, { status: "failed", finishedAt: timestamp, errorCode: "TEST_SCHEDULE_EXECUTION_INTERRUPTED", errorMessage: "서버 재시작으로 예약 실행이 중단되었습니다.", updatedAt: timestamp }); summary.scheduleExecutions += 1;
    }
    for (const comparison of await this.comparisons.list()) if (["pending", "processing"].includes(comparison.status)) {
      await this.comparisons.patch(comparison.id, { status: "failed", errorCode: "RUN_COMPARISON_INTERRUPTED", errorMessage: "서버 재시작으로 비교가 중단되었습니다.", updatedAt: timestamp }); summary.comparisons += 1;
    }
    for (const analysis of await this.aiAnalyses.list()) if (["pending", "processing"].includes(analysis.status)) {
      await this.aiAnalyses.patch(analysis.id, { status: "failed", errorCode: "AI_ANALYSIS_FAILED", errorMessage: "서버 재시작으로 AI 분석이 중단되었습니다.", finishedAt: timestamp, updatedAt: timestamp }); summary.aiAnalyses += 1;
    }
    for (const conversion of await this.aiConversions.list()) if (["pending", "processing"].includes(conversion.status)) {
      await this.aiConversions.patch(conversion.id, { status: "failed", failureCode: "AI_CONVERSION_INTERRUPTED", failureMessage: "서버 재시작으로 AI 변환이 중단되었습니다.", updatedAt: timestamp }); summary.aiConversions += 1;
    }
    for (const delivery of await this.deliveries.list()) if (["pending", "sending"].includes(delivery.status)) {
      await this.deliveries.patch(delivery.id, { status: "failed", errorCode: "NOTIFICATION_DELIVERY_INTERRUPTED", errorMessage: "서버 재시작으로 알림 전송이 중단되었습니다.", retryable: true, updatedAt: timestamp }); summary.notificationDeliveries += 1;
    }
    return summary;
  }
}

function elapsed(start: string, end: string): number { return Math.max(0, Date.parse(end) - Date.parse(start)); }
