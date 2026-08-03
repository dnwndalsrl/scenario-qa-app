const INTERNAL_PATH_PATTERN =
  /(?:[A-Za-z]:\\|\/(?:home|Users|var|tmp)\/)[^\s]+/g;

export function toPublicErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "MissingEnvironmentVariablesError") {
    return error.message;
  }
  if (error instanceof Error && error.name === "ScenarioValidationError") {
    return error.message.replace(INTERNAL_PATH_PATTERN, "[내부 경로]");
  }
  return "테스트 실행 중 내부 오류가 발생했습니다. 설정을 확인한 뒤 다시 시도해 주세요.";
}
