import { z } from "zod";

const actionSchema = z.enum([
  "goto",
  "fill",
  "click",
  "assert_url",
  "assert_visible",
  "unsupported"
]);

const targetSchema = z
  .object({
    strategy: z.enum([
      "testId",
      "role",
      "label",
      "placeholder",
      "text",
      "css"
    ]),
    value: z.string(),
    name: z.string().nullable(),
    exact: z.boolean().nullable()
  })
  .strict();

const expectedSchema = z
  .object({
    operator: z.enum(["equals", "contains"]),
    value: z.string()
  })
  .strict();

const stepSchema = z
  .object({
    temporaryId: z.string(),
    order: z.number(),
    name: z.string(),
    originalText: z.string(),
    action: actionSchema,
    target: targetSchema.nullable(),
    value: z.string().nullable(),
    expected: expectedSchema.nullable(),
    timeout: z.number().nullable(),
    required: z.boolean(),
    confidence: z.number(),
    reviewRequired: z.boolean(),
    reviewReason: z.string().nullable()
  })
  .strict();

const warningSchema = z
  .object({
    code: z.string(),
    stepTemporaryId: z.string().nullable(),
    message: z.string(),
    suggestedAction: z.string().nullable()
  })
  .strict();

const missingInformationSchema = z
  .object({
    type: z.enum([
      "missing_url",
      "missing_target",
      "missing_value",
      "missing_expected_result",
      "missing_environment_variable",
      "ambiguous_action",
      "ambiguous_target"
    ]),
    field: z.string(),
    stepTemporaryId: z.string().nullable(),
    message: z.string(),
    suggestedAction: z.string()
  })
  .strict();

const unsupportedStepSchema = z
  .object({
    temporaryId: z.string(),
    order: z.number(),
    originalText: z.string(),
    reason: z.string(),
    suggestion: z.string()
  })
  .strict();

const assumptionSchema = z
  .object({
    stepTemporaryId: z.string().nullable(),
    description: z.string()
  })
  .strict();

export const AiScenarioStructuredOutputSchema = z
  .object({
    scenario: z
      .object({
        name: z.string(),
        description: z.string().nullable(),
        startUrl: z.string(),
        stopOnFailure: z.boolean(),
        timeout: z.number(),
        steps: z.array(stepSchema)
      })
      .strict(),
    warnings: z.array(warningSchema),
    missingInformation: z.array(missingInformationSchema),
    unsupportedSteps: z.array(unsupportedStepSchema),
    assumptions: z.array(assumptionSchema)
  })
  .strict();

export type AiScenarioProviderResponse = z.infer<
  typeof AiScenarioStructuredOutputSchema
>;

export class AiResponseSchemaError extends Error {
  override readonly name = "AiResponseSchemaError";

  constructor(readonly issues: string[]) {
    super("AI 응답이 허용된 시나리오 스키마와 일치하지 않습니다.");
  }
}

export function parseAiScenarioProviderResponse(
  value: unknown,
  maxSteps: number
): AiScenarioProviderResponse {
  const parsed = AiScenarioStructuredOutputSchema.safeParse(value);
  if (!parsed.success) {
    throw new AiResponseSchemaError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "response"}: ${issue.message}`
      )
    );
  }

  const issues = validateRuntimeConstraints(parsed.data, maxSteps);
  if (issues.length > 0) {
    throw new AiResponseSchemaError(issues);
  }
  return parsed.data;
}

function validateRuntimeConstraints(
  value: AiScenarioProviderResponse,
  maxSteps: number
): string[] {
  const issues: string[] = [];
  checkString(issues, "scenario.name", value.scenario.name, 1, 120);
  if (value.scenario.description !== null) {
    checkString(
      issues,
      "scenario.description",
      value.scenario.description,
      0,
      500
    );
  }
  checkString(issues, "scenario.startUrl", value.scenario.startUrl, 0, 2048);
  checkTimeout(issues, "scenario.timeout", value.scenario.timeout);
  if (value.scenario.steps.length > maxSteps) {
    issues.push(
      `scenario.steps: 최대 ${maxSteps}개 단계까지만 생성할 수 있습니다.`
    );
  }

  const ids = new Set<string>();
  value.scenario.steps.forEach((step, index) => {
    const path = `scenario.steps.${index}`;
    checkString(issues, `${path}.temporaryId`, step.temporaryId, 1, 100);
    if (ids.has(step.temporaryId)) {
      issues.push(`${path}.temporaryId: 임시 ID가 중복되었습니다.`);
    }
    ids.add(step.temporaryId);
    if (!Number.isInteger(step.order) || step.order < 1) {
      issues.push(`${path}.order: 1 이상의 정수여야 합니다.`);
    }
    checkString(issues, `${path}.name`, step.name, 1, 160);
    checkString(issues, `${path}.originalText`, step.originalText, 1, 1000);
    if (step.timeout !== null) {
      checkTimeout(issues, `${path}.timeout`, step.timeout);
    }
    if (
      !Number.isFinite(step.confidence) ||
      step.confidence < 0 ||
      step.confidence > 1
    ) {
      issues.push(`${path}.confidence: 0 이상 1 이하여야 합니다.`);
    }
    if (step.reviewReason !== null) {
      checkString(issues, `${path}.reviewReason`, step.reviewReason, 0, 500);
    }
    if (step.target !== null) {
      checkString(issues, `${path}.target.value`, step.target.value, 0, 500);
      if (step.target.name !== null) {
        checkString(issues, `${path}.target.name`, step.target.name, 0, 200);
      }
    }
    if (step.value !== null) {
      checkString(issues, `${path}.value`, step.value, 0, 1000);
    }
    if (step.expected !== null) {
      checkString(
        issues,
        `${path}.expected.value`,
        step.expected.value,
        0,
        1000
      );
    }
  });

  validateListStrings(issues, "warnings", value.warnings);
  validateListStrings(
    issues,
    "missingInformation",
    value.missingInformation
  );
  validateListStrings(
    issues,
    "unsupportedSteps",
    value.unsupportedSteps
  );
  validateListStrings(issues, "assumptions", value.assumptions);
  return issues;
}

function validateListStrings(
  issues: string[],
  name: string,
  values: unknown[]
): void {
  if (values.length > 100) {
    issues.push(`${name}: 항목 수가 과도합니다.`);
  }
  values.forEach((value, index) => {
    const serialized = JSON.stringify(value);
    if (serialized.length > 3000) {
      issues.push(`${name}.${index}: 항목 길이가 제한을 초과했습니다.`);
    }
  });
}

function checkTimeout(
  issues: string[],
  path: string,
  value: number
): void {
  if (!Number.isInteger(value) || value < 1000 || value > 300000) {
    issues.push(`${path}: 1000~300000ms 범위의 정수여야 합니다.`);
  }
}

function checkString(
  issues: string[],
  path: string,
  value: string,
  min: number,
  max: number
): void {
  const length = value.trim().length;
  if (length < min || length > max) {
    issues.push(`${path}: 문자열 길이가 ${min}~${max} 범위를 벗어났습니다.`);
  }
}
