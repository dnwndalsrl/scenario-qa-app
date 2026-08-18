export const ERROR_MESSAGES: Record<string, string> = {
  ANALYSIS_INVALID_URL: "올바른 HTTP 또는 HTTPS URL을 입력해 주세요.",
  ANALYSIS_URL_NOT_ALLOWED: "허용되지 않은 URL입니다. 공개 웹페이지 주소인지 확인해 주세요.",
  ANALYSIS_SSRF_BLOCKED: "내부 네트워크나 보호된 주소에는 접속할 수 없습니다.",
  ANALYSIS_DNS_FAILED: "도메인 주소를 확인하지 못했습니다. URL을 다시 확인해 주세요.",
  ANALYSIS_REDIRECT_BLOCKED: "페이지가 보호된 주소로 이동하여 분석을 중단했습니다.",
  ANALYSIS_PAGE_LOAD_FAILED: "페이지를 불러오지 못했습니다. 대상 사이트 상태를 확인해 주세요.",
  ANALYSIS_PAGE_TIMEOUT: "페이지 응답 시간이 너무 길어 분석을 중단했습니다.",
  ANALYSIS_BROWSER_START_FAILED: "분석 브라우저를 시작하지 못했습니다.",
  ANALYSIS_PAGE_COLLECTION_FAILED: "페이지 구조를 수집하지 못했습니다.",
  ANALYSIS_TOO_MANY_ELEMENTS: "분석 가능한 요소 수 제한을 초과했습니다.",
  AI_NOT_CONFIGURED: "OpenAI API 키가 설정되지 않았습니다. .env의 OPENAI_API_KEY를 설정해 주세요.",
  AI_PAGE_ANALYSIS_FAILED: "AI 페이지 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  AI_PAGE_ANALYSIS_INVALID_RESPONSE: "AI 분석 응답을 안전하게 검증하지 못했습니다.",
  AI_TEST_GENERATION_FAILED: "AI 테스트 생성에 실패했습니다.",
  AI_TEST_GENERATION_INVALID_RESPONSE: "생성된 테스트를 안전하게 검증하지 못했습니다.",
  TEST_SAFETY_BLOCKED: "안전 정책에 따라 이 테스트는 실행하지 않았습니다.",
  TEST_LOCATOR_NOT_FOUND: "테스트 대상 요소를 찾지 못했습니다.",
  TEST_LOCATOR_NOT_UNIQUE: "테스트 대상 요소를 하나로 특정하지 못했습니다.",
  TEST_DYNAMIC_HEADER_HIDDEN: "동적 헤더 안의 대상 요소가 화면에 나타나지 않았습니다.",
  TEST_TARGET_NOT_ACTIONABLE: "테스트 대상 요소가 표시되어 있지만 클릭할 수 없는 상태입니다.",
  TEST_CLICK_OUTCOME_MISMATCH: "클릭 후 기대한 화면 변화가 확인되지 않았습니다.",
  TEST_EXECUTION_FAILED: "테스트 실행 중 오류가 발생했습니다.",
  TEST_EXECUTION_TIMEOUT: "테스트 실행 제한 시간을 초과했습니다.",
  STORAGE_WRITE_FAILED: "분석 결과를 저장하지 못했습니다.",
  ARTIFACT_SAVE_FAILED: "스크린샷 증거를 저장하지 못했습니다.",
  ANALYSIS_NOT_FOUND: "분석 작업을 찾을 수 없습니다.",
  ANALYSIS_ALREADY_RUNNING: "다른 분석이 진행 중입니다. 완료 후 다시 시도해 주세요."
  ,CRAWL_PAGE_LIMIT_REACHED: "최대 페이지 수에 도달하여 탐색을 정상 종료했습니다."
  ,CRAWL_DEPTH_LIMIT_REACHED: "최대 탐색 깊이에 도달했습니다."
  ,CRAWL_TOTAL_TIMEOUT: "사이트 전체 탐색 제한 시간을 초과했습니다."
  ,CRAWL_QUEUE_FAILED: "페이지 탐색 대기열 처리에 실패했습니다."
  ,CRAWL_PAGE_FAILED: "일부 페이지를 수집하지 못했습니다."
  ,CRAWL_URL_FILTERED: "안전 정책에 따라 URL을 탐색하지 않았습니다."
  ,CRAWL_EXTERNAL_ORIGIN: "동일 origin이 아닌 링크는 탐색하지 않습니다."
  ,CRAWL_REDIRECT_BLOCKED: "다른 origin으로 이동하는 redirect를 차단했습니다."
  ,CRAWL_DUPLICATE_PAGE: "이미 분석한 페이지와 동일한 페이지입니다."
  ,CRAWL_PATTERN_LIMIT_REACHED: "같은 URL 패턴의 페이지 방문 제한에 도달했습니다."
  ,CRAWL_NO_VALID_PAGES: "분석 가능한 페이지를 찾지 못했습니다."
  ,SITE_ANALYSIS_FAILED: "사이트 수준 분석을 생성하지 못했습니다."
  ,SITE_TEST_GENERATION_FAILED: "사이트 공통 테스트 생성에 실패했습니다."
  ,TEST_DEDUPLICATION_FAILED: "중복 테스트 정리에 실패했습니다."
  ,SITE_MAP_BUILD_FAILED: "사이트 구조를 생성하지 못했습니다."
};

export class AppError extends Error {
  constructor(public readonly code: string, message = ERROR_MESSAGES[code] ?? "요청을 처리하지 못했습니다.", public readonly statusCode = 400, public readonly detail?: string) {
    super(message);
    this.name = "AppError";
  }
}
