import type { JsonValue } from "../types/result.js";

export class ScenarioValidationError extends Error {
  override readonly name = "ScenarioValidationError";
}

export class MissingEnvironmentVariablesError extends Error {
  override readonly name = "MissingEnvironmentVariablesError";

  constructor(readonly variableNames: string[]) {
    super(
      `필수 환경변수가 없습니다: ${variableNames.sort().join(", ")}`
    );
  }
}

export interface LocatorErrorDetails {
  strategy: string;
  value: string;
  count: number;
}

export class LocatorResolutionError extends Error {
  override readonly name = "LocatorResolutionError";

  constructor(
    readonly details: LocatorErrorDetails,
    message: string
  ) {
    super(message);
  }
}

export class AssertionFailedError extends Error {
  override readonly name = "AssertionFailedError";

  constructor(
    message: string,
    readonly expected: JsonValue,
    readonly actual: JsonValue
  ) {
    super(message);
  }
}
