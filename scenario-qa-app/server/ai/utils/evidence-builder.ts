import type {
  AnalysisEvidence
} from "../../../shared/types/ai-failure-analysis.js";
import type { TestProject } from "../../../shared/types/project.js";
import type {
  ElementTarget,
  TestScenario,
  TestStep
} from "../../../shared/types/scenario.js";
import type {
  JsonValue,
  RunStepResult,
  TestRunDetail
} from "../../../shared/types/test-run.js";
import type {
  AiFailureAnalysisLimits,
  AnalysisScenarioStep
} from "../types/ai-failure-analysis.js";
import {
  normalizeConsoleLogs,
  normalizeNetworkErrors,
  sanitizeLogMessage
} from "./log-sanitizer.js";
import { sanitizeUrl } from "./url-sanitizer.js";

export interface EvidenceBuildResult {
  evidence: AnalysisEvidence[];
  scenarioSteps: AnalysisScenarioStep[];
  limitations: string[];
  hasMeaningfulEvidence: boolean;
}

export function buildAnalysisEvidence(
  project: TestProject,
  scenario: TestScenario,
  detail: TestRunDetail,
  limits: AiFailureAnalysisLimits
): EvidenceBuildResult {
  const evidence: AnalysisEvidence[] = [];
  const limitations: string[] = [];
  const result = detail.result;
  const scenarioStepById = new Map(
    scenario.steps.map((step) => [step.id, step])
  );
  const orderById = new Map(
    scenario.steps.map((step) => [step.id, step.order])
  );

  if (detail.run.errorMessage !== undefined) {
    evidence.push({
      id: "run-error",
      type: "run_error",
      description: "테스트 실행 수준의 오류가 기록되었습니다.",
      timestamp: detail.run.finishedAt ?? detail.run.createdAt,
      value: {
        status: detail.run.status,
        errorMessage: sanitizeLogMessage(
          detail.run.errorMessage,
          limits.maxMessageLength
        )
      }
    });
  }

  if (result === null) {
    limitations.push("단계별 실행 결과 파일이 없어 실행 수준 오류만 분석합니다.");
    return {
      evidence,
      scenarioSteps: [],
      limitations,
      hasMeaningfulEvidence: evidence.length > 0
    };
  }

  const selectedSteps = selectRelevantSteps(
    result.steps,
    limits.maxFailedSteps
  );
  if (selectedSteps.length < result.steps.length) {
    limitations.push(
      `입력 제한으로 관련성이 높은 ${selectedSteps.length}개 단계만 포함했습니다.`
    );
  }

  const scenarioSteps = selectedSteps.map<AnalysisScenarioStep>((runStep) => {
    const source = scenarioStepById.get(runStep.stepId);
    return {
      stepId: runStep.stepId,
      order: orderById.get(runStep.stepId) ?? 0,
      name: sanitizeLogMessage(runStep.stepName, limits.maxMessageLength),
      action: runStep.action,
      description: describeScenarioStep(source, limits.maxMessageLength),
      executionStatus: runStep.status,
      isFailurePoint:
        runStep.status === "failed" || runStep.status === "error"
    };
  });

  selectedSteps
    .filter((step) => step.status !== "success")
    .forEach((step) => {
      const source = scenarioStepById.get(step.stepId);
      const order = orderById.get(step.stepId) ?? 0;
      const previous = result.steps.find(
        (candidate) =>
          (orderById.get(candidate.stepId) ?? 0) === order - 1
      );
      const next = result.steps.find(
        (candidate) =>
          (orderById.get(candidate.stepId) ?? 0) === order + 1
      );
      const evidenceId = `step-${order || step.stepId}-result`;
      evidence.push({
        id: evidenceId,
        type: "step_result",
        description: `${order || "?"}번 단계가 ${step.status} 상태로 기록되었습니다.`,
        stepId: step.stepId,
        timestamp: step.finishedAt,
        value: {
          order,
          name: sanitizeLogMessage(step.stepName, limits.maxMessageLength),
          action: step.action,
          target: sanitizeTarget(source?.target, limits.maxMessageLength),
          expected: sanitizeJsonValue(step.expected, limits.maxMessageLength),
          actual: sanitizeJsonValue(step.actual, limits.maxMessageLength),
          errorMessage:
            step.errorMessage === null
              ? null
              : sanitizeLogMessage(step.errorMessage, limits.maxMessageLength),
          currentUrl: sanitizeUrl(step.currentUrl),
          durationMs: step.durationMs,
          previousStepStatus: previous?.status ?? null,
          nextStepStatus: next?.status ?? null
        }
      });
      if (step.screenshotArtifactId !== null) {
        evidence.push({
          id: `screenshot-${order || step.stepId}`,
          type: "screenshot_metadata",
          description: `${order || "?"}번 단계 실패 스크린샷이 저장되어 있습니다. 이미지 자체는 AI에 전달하지 않습니다.`,
          stepId: step.stepId,
          timestamp: step.finishedAt,
          value: {
            exists: true,
            stepId: step.stepId,
            capturedAt: step.finishedAt,
            viewportWidth: 1280,
            viewportHeight: 720,
            currentUrl: sanitizeUrl(step.currentUrl)
          }
        });
      }
    });

  const failedSteps = selectedSteps.filter(
    (step) => step.status === "failed" || step.status === "error"
  );
  const consoleEntries = normalizeConsoleLogs(
    result.consoleLogs,
    limits.maxConsoleErrors,
    limits.maxMessageLength
  );
  consoleEntries.forEach((entry, index) => {
    const related = findRelatedStep(entry.timestamp, failedSteps);
    evidence.push({
      id: `console-${index + 1}`,
      type: "console_error",
      description: `브라우저 콘솔 ${entry.type} 메시지가 기록되었습니다.`,
      ...(related === undefined ? {} : { stepId: related.stepId }),
      timestamp: entry.timestamp,
      value: {
        type: entry.type,
        message: entry.message,
        count: entry.count,
        relatedStepId: related?.stepId ?? null
      }
    });
  });
  if (result.consoleLogs.length === 0) {
    limitations.push("실패 시점에 수집된 콘솔 오류가 없습니다.");
  } else if (consoleEntries.length < result.consoleLogs.length) {
    limitations.push("반복되거나 입력 제한을 넘는 콘솔 로그를 병합·제외했습니다.");
  }

  const networkEntries = normalizeNetworkErrors(
    result.networkErrors,
    limits.maxNetworkErrors,
    limits.maxMessageLength
  );
  networkEntries.forEach((entry, index) => {
    const related = findRelatedStep(entry.timestamp, failedSteps);
    evidence.push({
      id: `network-${index + 1}`,
      type: "network_error",
      description: `네트워크 요청 실패 또는 HTTP 오류가 기록되었습니다.`,
      ...(related === undefined ? {} : { stepId: related.stepId }),
      timestamp: entry.timestamp,
      value: {
        method: entry.method,
        url: entry.url,
        status: entry.status,
        resourceType: entry.resourceType,
        failureText: entry.failureText,
        count: entry.count,
        relatedStepId: related?.stepId ?? null
      }
    });
  });
  if (result.networkErrors.length === 0) {
    limitations.push("실패 시점에 수집된 네트워크 오류가 없습니다.");
  } else if (networkEntries.length < result.networkErrors.length) {
    limitations.push("반복되거나 입력 제한을 넘는 네트워크 오류를 병합·제외했습니다.");
  }

  if (!evidence.some((item) => item.type === "screenshot_metadata")) {
    limitations.push("실패 단계와 연결된 스크린샷 메타데이터가 없습니다.");
  }
  if (
    !selectedSteps.some(
      (step) => step.status === "failed" || step.status === "error"
    )
  ) {
    limitations.push(
      "직접 실패한 단계가 없어 blocked 상태의 선행 실행 정보만 분석합니다."
    );
  }

  return {
    evidence,
    scenarioSteps,
    limitations: [...new Set(limitations)],
    hasMeaningfulEvidence:
      detail.run.errorMessage !== undefined ||
      selectedSteps.some(
        (step) => step.status === "failed" || step.status === "error"
      ) ||
      consoleEntries.length > 0 ||
      networkEntries.length > 0
  };
}

function selectRelevantSteps(
  steps: RunStepResult[],
  limit: number
): RunStepResult[] {
  if (steps.length <= limit) {
    return [...steps];
  }
  const failureIndexes = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.status !== "success")
    .map(({ index }) => index);
  const selected = new Set<number>();
  for (const index of failureIndexes) {
    [index - 1, index, index + 1].forEach((candidate) => {
      if (candidate >= 0 && candidate < steps.length) {
        selected.add(candidate);
      }
    });
  }
  for (let index = 0; index < steps.length && selected.size < limit; index += 1) {
    selected.add(index);
  }
  return [...selected]
    .sort((left, right) => left - right)
    .slice(0, limit)
    .map((index) => steps[index])
    .filter((step): step is RunStepResult => step !== undefined);
}

function describeScenarioStep(
  step: TestStep | undefined,
  maxLength: number
): string {
  if (step === undefined) {
    return "저장된 시나리오 단계 정보를 찾을 수 없습니다.";
  }
  const target = step.target === undefined
    ? "대상 없음"
    : `${step.target.strategy}:${sanitizeLogMessage(step.target.value, maxLength)}`;
  const value = step.value === undefined
    ? ""
    : step.sensitive
      ? " · 값 [REDACTED]"
      : ` · 값 ${sanitizeLogMessage(step.value, maxLength)}`;
  return sanitizeLogMessage(
    `${step.name} · ${step.action} · ${target}${value}`,
    maxLength
  );
}

function sanitizeTarget(
  target: ElementTarget | undefined,
  maxLength: number
): JsonValue {
  if (target === undefined) {
    return null;
  }
  return {
    strategy: target.strategy,
    value: sanitizeLogMessage(target.value, maxLength),
    ...(target.name === undefined
      ? {}
      : { name: sanitizeLogMessage(target.name, maxLength) }),
    ...(target.exact === undefined ? {} : { exact: target.exact })
  };
}

function sanitizeJsonValue(value: JsonValue, maxLength: number): JsonValue {
  return sanitizeUnknown(value, maxLength, 0);
}

function sanitizeUnknown(
  value: unknown,
  maxLength: number,
  depth: number
): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeLogMessage(value, maxLength);
  }
  if (depth >= 4) {
    return "[중첩 데이터 생략]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) =>
      sanitizeUnknown(item, maxLength, depth + 1)
    );
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !/(authorization|cookie|body|password|token|secret)/i.test(key))
        .slice(0, 30)
        .map(([key, item]) => [
          key,
          sanitizeUnknown(item, maxLength, depth + 1)
        ])
    );
  }
  return String(value).slice(0, maxLength);
}

function findRelatedStep(
  timestamp: string,
  steps: RunStepResult[]
): RunStepResult | undefined {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) {
    return undefined;
  }
  return steps.find((step) => {
    const start = Date.parse(step.startedAt) - 2000;
    const end = Date.parse(step.finishedAt) + 2000;
    return time >= start && time <= end;
  });
}
