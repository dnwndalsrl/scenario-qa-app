import type { TestStep } from "../../shared/types/scenario.js";
import type { TestRunDetail } from "../../shared/types/test-run.js";
import type { ComparisonConfig } from "./types/test-run-comparison.js";

export const comparisonConfig: ComparisonConfig = {
  algorithmVersion: "v1",
  durationWarningRate: 0.3,
  durationCriticalRate: 0.8,
  durationMinDifferenceMs: 500,
  durationCriticalDifferenceMs: 1000,
  stepMatchMinConfidence: 0.8,
  maxConsoleItems: 100,
  maxNetworkItems: 100
};

export const comparisonSteps: TestStep[] = [
  {
    id: "step-url",
    order: 1,
    name: "URL 확인",
    action: "assert_url",
    expected: { operator: "contains", value: "/dashboard" },
    timeout: 10000,
    required: true
  },
  {
    id: "step-visible",
    order: 2,
    name: "제목 노출 확인",
    action: "assert_visible",
    target: { strategy: "testId", value: "dashboard-title" },
    timeout: 10000,
    required: true
  }
];

export const baselineRunDetail: TestRunDetail = makeRunDetail({
  id: "run-baseline",
  status: "success",
  durationMs: 3000,
  stepStatuses: ["success", "success"],
  networkStatus: 200,
  consoleText: "TypeError at app.abc12345.js:20:10 request 1234567890123"
});

export const comparisonRunDetail: TestRunDetail = makeRunDetail({
  id: "run-comparison",
  status: "failed",
  durationMs: 6000,
  stepStatuses: ["failed", "blocked"],
  networkStatus: 500,
  consoleText: "TypeError at app.def67890.js:48:22 request 9876543210987"
});

function makeRunDetail(input: {
  id: string;
  status: "success" | "failed";
  durationMs: number;
  stepStatuses: ["success" | "failed", "success" | "blocked"];
  networkStatus: number;
  consoleText: string;
}): TestRunDetail {
  const createdAt =
    input.id === "run-baseline"
      ? "2026-08-03T00:00:00.000Z"
      : "2026-08-03T01:00:00.000Z";
  return {
    run: {
      id: input.id,
      projectId: "project-comparison",
      scenarioId: "scenario-comparison",
      status: input.status,
      durationMs: input.durationMs,
      totalSteps: 2,
      successCount: input.stepStatuses.filter((status) => status === "success").length,
      failedCount: input.stepStatuses.filter((status) => status === "failed").length,
      blockedCount: input.stepStatuses.filter((status) => status === "blocked").length,
      errorCount: 0,
      scenarioUpdatedAt: createdAt,
      createdAt
    },
    result: {
      scenarioId: "scenario-comparison",
      scenarioName: "회귀 비교",
      status: input.status,
      startedAt: createdAt,
      finishedAt: createdAt,
      durationMs: input.durationMs,
      totalSteps: 2,
      successCount: input.stepStatuses.filter((status) => status === "success").length,
      failedCount: input.stepStatuses.filter((status) => status === "failed").length,
      blockedCount: input.stepStatuses.filter((status) => status === "blocked").length,
      errorCount: 0,
      steps: comparisonSteps.map((definition, index) => ({
        stepId: definition.id,
        stepName: definition.name,
        action: definition.action,
        status: input.stepStatuses[index]!,
        startedAt: createdAt,
        finishedAt: createdAt,
        durationMs: index === 0 ? input.durationMs / 2 : input.durationMs / 3,
        expected: { value: "/dashboard" },
        actual:
          input.stepStatuses[index] === "success"
            ? { value: "/dashboard", sessionId: "session-12345678" }
            : { value: "/login", timestamp: createdAt },
        errorMessage:
          input.stepStatuses[index] === "failed"
            ? "요소 실패 password=secret"
            : null,
        screenshotArtifactId:
          input.stepStatuses[index] === "failed" ? "artifact-failure" : null,
        currentUrl: `https://qa.example.com/dashboard?token=secret&b=2&a=1`
      })),
      consoleLogs: [
        { type: "error", text: input.consoleText, timestamp: createdAt }
      ],
      networkErrors: [
        {
          url: "https://qa.example.com/api/login?token=secret",
          method: "POST",
          status: input.networkStatus,
          failureText: null,
          resourceType: "fetch",
          timestamp: createdAt
        }
      ]
    }
  };
}
