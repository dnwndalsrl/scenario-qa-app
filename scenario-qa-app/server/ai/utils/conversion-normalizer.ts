import type {
  AiAssumption,
  AiConversionSummary,
  AiConversionWarning,
  AiExecutableStepDraft,
  AiMissingInformation,
  AiScenarioConversionRequest,
  AiScenarioDraft,
  AiUnsupportedStep
} from "../../../shared/types/ai-scenario.js";
import type {
  ElementTarget,
  TestAction,
  UrlExpectation
} from "../../../shared/types/scenario.js";
import {
  AiResponseSchemaError,
  type AiScenarioProviderResponse
} from "../schemas/ai-scenario-response.schema.js";
import { extractEnvironmentReferences } from "./prompt-input-builder.js";

export interface NormalizedAiConversion {
  scenarioDraft: AiScenarioDraft;
  warnings: AiConversionWarning[];
  missingInformation: AiMissingInformation[];
  unsupportedSteps: AiUnsupportedStep[];
  assumptions: AiAssumption[];
  summary: AiConversionSummary;
}

export function normalizeAiConversionResponse(
  raw: AiScenarioProviderResponse,
  input: AiScenarioConversionRequest
): NormalizedAiConversion {
  assertUnsupportedStepsAreSeparated(raw);
  assertCssSelectorsCameFromUser(raw, input);

  const warnings = raw.warnings.map((warning) => ({
    code: warning.code,
    ...(warning.stepTemporaryId === null
      ? {}
      : { stepTemporaryId: warning.stepTemporaryId }),
    message: warning.message.trim(),
    ...(warning.suggestedAction === null
      ? {}
      : { suggestedAction: warning.suggestedAction.trim() })
  }));
  const missingInformation = raw.missingInformation.map((item) => ({
    type: item.type,
    field: item.field,
    ...(item.stepTemporaryId === null
      ? {}
      : { stepTemporaryId: item.stepTemporaryId }),
    message: item.message.trim(),
    suggestedAction: item.suggestedAction.trim()
  }));
  const assumptions = raw.assumptions.map((assumption) => ({
    ...(assumption.stepTemporaryId === null
      ? {}
      : { stepTemporaryId: assumption.stepTemporaryId }),
    description: assumption.description.trim()
  }));
  const unsupportedSteps = raw.unsupportedSteps
    .map((step) => ({
      temporaryId: step.temporaryId,
      order: step.order,
      originalText: step.originalText.trim(),
      reason: step.reason.trim(),
      suggestion: step.suggestion.trim()
    }))
    .sort((left, right) => left.order - right.order)
    .map((step, index) => ({ ...step, order: index + 1 }));

  const orderedExecutableSteps = raw.scenario.steps
    .filter(
      (
        step
      ): step is typeof step & {
        action: Exclude<typeof step.action, "unsupported">;
      } => step.action !== "unsupported"
    )
    .sort((left, right) => left.order - right.order);

  const executableSteps = orderedExecutableSteps.map((step, index) => {
    const semanticIssues = collectSemanticIssues(
      step,
      input.availableEnvironmentVariables
    );
    missingInformation.push(...semanticIssues);
    const hasAssumption = assumptions.some(
      (assumption) => assumption.stepTemporaryId === step.temporaryId
    );
    const reviewRequired =
      step.reviewRequired ||
      step.confidence < 0.85 ||
      semanticIssues.length > 0 ||
      hasAssumption;
    return normalizeExecutableStep(
      step,
      index,
      reviewRequired,
      semanticIssues[0]?.message
    );
  });

  const deduplicatedMissing = deduplicateMissingInformation(
    missingInformation
  );
  const scenarioDraft: AiScenarioDraft = {
    name: raw.scenario.name.trim() || input.name,
    ...(raw.scenario.description === null ||
    raw.scenario.description.trim().length === 0
      ? {}
      : { description: raw.scenario.description.trim() }),
    startUrl: raw.scenario.startUrl.trim(),
    stopOnFailure: raw.scenario.stopOnFailure,
    timeout: raw.scenario.timeout,
    steps: executableSteps
  };
  const averageConfidence =
    executableSteps.length === 0
      ? 0
      : executableSteps.reduce(
          (total, step) => total + step.confidence,
          0
        ) / executableSteps.length;
  const summary: AiConversionSummary = {
    originalStepCount: countOriginalSteps(input.naturalLanguage),
    convertedStepCount: executableSteps.length,
    reviewRequiredCount: executableSteps.filter(
      (step) => step.reviewRequired
    ).length,
    warningCount: warnings.length,
    missingInformationCount: deduplicatedMissing.length,
    unsupportedCount: unsupportedSteps.length,
    averageConfidence: Math.round(averageConfidence * 100) / 100
  };

  return {
    scenarioDraft,
    warnings,
    missingInformation: deduplicatedMissing,
    unsupportedSteps,
    assumptions,
    summary
  };
}

function normalizeExecutableStep(
  step: AiScenarioProviderResponse["scenario"]["steps"][number] & {
    action: TestAction;
  },
  index: number,
  reviewRequired: boolean,
  semanticReason?: string
): AiExecutableStepDraft {
  const target = normalizeTarget(step.target);
  const expected = normalizeExpected(step.expected);
  const reviewReason =
    step.reviewReason?.trim() ||
    semanticReason ||
    (step.confidence < 0.85
      ? "신뢰도가 낮아 대상 요소와 값을 확인해야 합니다."
      : undefined);
  return {
    temporaryId: step.temporaryId,
    order: index + 1,
    name: step.name.trim(),
    originalText: step.originalText.trim(),
    action: step.action,
    ...(target === undefined ? {} : { target }),
    ...(step.value === null ? {} : { value: step.value }),
    ...(expected === undefined ? {} : { expected }),
    timeout: step.timeout ?? 15000,
    required: step.required,
    confidence: step.confidence,
    reviewRequired,
    ...(reviewReason === undefined ? {} : { reviewReason })
  };
}

function normalizeTarget(
  target: AiScenarioProviderResponse["scenario"]["steps"][number]["target"]
): ElementTarget | undefined {
  if (target === null) {
    return undefined;
  }
  return {
    strategy: target.strategy,
    value: target.value,
    ...(target.name === null || target.name.trim().length === 0
      ? {}
      : { name: target.name.trim() }),
    ...(target.exact === null ? {} : { exact: target.exact })
  };
}

function normalizeExpected(
  expected: AiScenarioProviderResponse["scenario"]["steps"][number]["expected"]
): UrlExpectation | undefined {
  return expected === null
    ? undefined
    : { operator: expected.operator, value: expected.value };
}

function collectSemanticIssues(
  step: AiScenarioProviderResponse["scenario"]["steps"][number],
  availableEnvironmentVariables: readonly string[]
): AiMissingInformation[] {
  const issues: AiMissingInformation[] = [];
  const add = (
    type: AiMissingInformation["type"],
    field: string,
    message: string,
    suggestedAction: string
  ): void => {
    issues.push({
      type,
      field,
      stepTemporaryId: step.temporaryId,
      message,
      suggestedAction
    });
  };

  if (step.action === "goto" && !hasText(step.value)) {
    add(
      "missing_url",
      `${step.temporaryId}.value`,
      "이동할 URL 또는 경로가 필요합니다.",
      "/login과 같은 시작 경로를 입력해 주세요."
    );
  }
  if (["fill", "click", "assert_visible"].includes(step.action)) {
    if (step.target === null || !hasText(step.target.value)) {
      add(
        "missing_target",
        `${step.temporaryId}.target`,
        "대상 요소를 식별할 정보가 필요합니다.",
        "testId, role, label 또는 화면 문구를 입력해 주세요."
      );
    }
  }
  if (step.action === "fill" && !hasText(step.value)) {
    add(
      "missing_value",
      `${step.temporaryId}.value`,
      "입력할 값 또는 환경변수 참조가 필요합니다.",
      "{{TEST_VALUE}}와 같은 환경변수 참조를 입력해 주세요."
    );
  }
  if (
    step.action === "assert_url" &&
    (step.expected === null || !hasText(step.expected.value))
  ) {
    add(
      "missing_expected_result",
      `${step.temporaryId}.expected`,
      "확인할 URL 값이 필요합니다.",
      "/dashboard와 같은 예상 URL을 입력해 주세요."
    );
  }

  if (step.value !== null) {
    const unavailable = extractEnvironmentReferences(step.value).filter(
      (name) => !availableEnvironmentVariables.includes(name)
    );
    unavailable.forEach((name) =>
      add(
        "missing_environment_variable",
        `${step.temporaryId}.value`,
        `사용 가능한 환경변수 목록에 ${name}이(가) 없습니다.`,
        `${name}을(를) 사용 가능한 환경변수 목록에 추가하거나 입력값을 수정해 주세요.`
      )
    );
  }
  return issues;
}

function assertUnsupportedStepsAreSeparated(
  raw: AiScenarioProviderResponse
): void {
  const unsupportedInScenario = raw.scenario.steps.filter(
    (step) => step.action === "unsupported"
  );
  const unsupportedIds = new Set(
    raw.unsupportedSteps.map((step) => step.temporaryId)
  );
  const scenarioIds = new Set(
    unsupportedInScenario.map((step) => step.temporaryId)
  );
  const missing = unsupportedInScenario.filter(
    (step) => !unsupportedIds.has(step.temporaryId)
  );
  const extra = raw.unsupportedSteps.filter(
    (step) => !scenarioIds.has(step.temporaryId)
  );
  if (missing.length > 0 || extra.length > 0) {
    throw new AiResponseSchemaError([
      "unsupported 단계와 unsupportedSteps 목록의 temporaryId가 일치해야 합니다."
    ]);
  }
}

function assertCssSelectorsCameFromUser(
  raw: AiScenarioProviderResponse,
  input: AiScenarioConversionRequest
): void {
  const source = [
    input.naturalLanguage,
    input.additionalContext ?? ""
  ].join("\n");
  const invented = raw.scenario.steps.find(
    (step) =>
      step.target?.strategy === "css" &&
      hasText(step.target.value) &&
      !source.includes(step.target.value)
  );
  if (invented !== undefined) {
    throw new AiResponseSchemaError([
      `${invented.temporaryId}: 사용자가 제공하지 않은 CSS selector를 생성했습니다.`
    ]);
  }
}

function deduplicateMissingInformation(
  values: AiMissingInformation[]
): AiMissingInformation[] {
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = `${item.type}:${item.field}:${item.stepTemporaryId ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function countOriginalSteps(value: string): number {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return Math.max(lines.length, 1);
}

function hasText(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim().length > 0;
}
