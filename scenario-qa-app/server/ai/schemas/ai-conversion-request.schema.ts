import { z } from "zod";
import type { AiScenarioConversionRequest } from "../../../shared/types/ai-scenario.js";
import { AppError } from "../../utils/api.js";
import {
  findInvalidEnvironmentVariableNames,
  normalizeEnvironmentVariableNames
} from "../utils/prompt-input-builder.js";

const requestSchema = z
  .object({
    projectId: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    startUrl: z.string().trim().max(2048),
    naturalLanguage: z.string().trim().min(10),
    stopOnFailure: z.boolean(),
    timeout: z.number().int().min(1000).max(300000),
    availableEnvironmentVariables: z
      .array(z.string().max(80))
      .max(30),
    additionalContext: z.string().trim().max(2000).optional()
  })
  .strict();

export function parseAiConversionRequest(
  value: unknown,
  maxInputLength: number
): AiScenarioConversionRequest {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      400,
      "AI_INPUT_REQUIRED",
      "시나리오 이름과 자연어 테스트 절차를 확인해 주세요.",
      {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      }
    );
  }
  if (parsed.data.naturalLanguage.length > maxInputLength) {
    throw new AppError(
      400,
      "AI_INPUT_TOO_LONG",
      `자연어 테스트 절차는 최대 ${maxInputLength.toLocaleString()}자까지 입력할 수 있습니다.`
    );
  }

  const invalidNames = findInvalidEnvironmentVariableNames(
    parsed.data.availableEnvironmentVariables
  );
  if (invalidNames.length > 0) {
    throw new AppError(
      400,
      "AI_INPUT_REQUIRED",
      "환경변수 이름은 영문 대문자, 숫자, 밑줄만 사용할 수 있습니다.",
      { invalidNames }
    );
  }
  const description =
    parsed.data.description?.trim().length === 0
      ? undefined
      : parsed.data.description;
  const additionalContext =
    parsed.data.additionalContext?.trim().length === 0
      ? undefined
      : parsed.data.additionalContext;
  return {
    projectId: parsed.data.projectId,
    name: parsed.data.name,
    ...(description === undefined ? {} : { description }),
    startUrl: parsed.data.startUrl,
    naturalLanguage: parsed.data.naturalLanguage,
    stopOnFailure: parsed.data.stopOnFailure,
    timeout: parsed.data.timeout,
    availableEnvironmentVariables: normalizeEnvironmentVariableNames(
      parsed.data.availableEnvironmentVariables
    ),
    ...(additionalContext === undefined ? {} : { additionalContext })
  };
}
