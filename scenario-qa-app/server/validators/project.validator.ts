import type { ProjectInput } from "../../shared/types/project.js";
import { AppError } from "../utils/api.js";
import { assertSafeTestTargetUrl } from "../security/test-target-url-policy.js";

const MIN_TIMEOUT = 1000;
const MAX_TIMEOUT = 300000;

export function parseProjectInput(
  body: Record<string, unknown>
): ProjectInput {
  const name = requiredString(body.name, "프로젝트명을 입력해 주세요.");
  const baseUrl = normalizeProjectUrl(
    requiredString(body.baseUrl, "기본 URL을 입력해 주세요.")
  );
  const environmentName = requiredString(
    body.environmentName,
    "테스트 환경 이름을 입력해 주세요."
  );
  const defaultTimeout = requiredNumber(
    body.defaultTimeout,
    "기본 제한 시간을 입력해 주세요."
  );
  if (defaultTimeout < MIN_TIMEOUT || defaultTimeout > MAX_TIMEOUT) {
    throw new AppError(
      400,
      "INVALID_TIMEOUT",
      `기본 제한 시간은 ${MIN_TIMEOUT}~${MAX_TIMEOUT}ms여야 합니다.`
    );
  }
  if (typeof body.stopOnFailure !== "boolean") {
    throw new AppError(400, "INVALID_STOP_POLICY", "실패 시 중단 여부를 선택해 주세요.");
  }
  const description =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim()
      : undefined;

  return {
    name: name.trim(),
    baseUrl,
    environmentName: environmentName.trim(),
    defaultTimeout,
    stopOnFailure: body.stopOnFailure,
    ...(description === undefined ? {} : { description })
  };
}

function normalizeProjectUrl(value: string): string {
  const url = assertSafeTestTargetUrl(value);
  return url.toString().replace(/\/+$/, "");
}

function requiredString(input: unknown, message: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", message);
  }
  return input;
}

function requiredNumber(input: unknown, message: string): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    throw new AppError(400, "VALIDATION_ERROR", message);
  }
  return input;
}
