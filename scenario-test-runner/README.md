# Scenario Test Runner

고정 JSON 시나리오를 Chromium에서 실행하고 단계 결과, 실패 스크린샷, 콘솔 오류, 네트워크 오류를 JSON으로 저장하는 최소 Playwright 엔진입니다.

## 1. 이번 단계에서 구현한 범위

- `goto`, `fill`, `click`, `assert_url`, `assert_visible`
- `testId`, `role`, `label`, `placeholder`, `text`, `css` locator
- locator 후보 개수 1개 강제
- 환경변수 placeholder 사전 치환과 누락 검사
- 단계별 `success`, `failed`, `blocked`, `error`
- 필수 단계 실패 시 후속 단계 중단
- 실패·오류 screenshot
- console `error`, `warning`, `pageerror`
- request failure와 HTTP 400 이상
- 결과 terminal 요약과 `artifacts/results` JSON 저장

Nuxt, DB, Redis, BullMQ, AI, 인증, Docker는 포함하지 않습니다.

## 2. 최종 프로젝트 구조

```text
scenario-test-runner/
├─ package.json
├─ tsconfig.json
├─ playwright.config.ts
├─ .env.example
├─ README.md
├─ src/
│  ├─ types/
│  │  ├─ scenario.ts
│  │  └─ result.ts
│  ├─ constants/
│  │  ├─ test-action.ts
│  │  └─ test-status.ts
│  ├─ locators/
│  │  └─ locator-resolver.ts
│  ├─ actions/
│  │  ├─ goto-action.ts
│  │  ├─ fill-action.ts
│  │  ├─ click-action.ts
│  │  ├─ assert-url-action.ts
│  │  └─ assert-visible-action.ts
│  ├─ runner/
│  │  ├─ scenario-runner.ts
│  │  └─ step-runner.ts
│  ├─ collectors/
│  │  ├─ console-collector.ts
│  │  └─ network-collector.ts
│  ├─ utils/
│  │  ├─ environment.ts
│  │  ├─ errors.ts
│  │  ├─ file.ts
│  │  ├─ redact.ts
│  │  ├─ scenario-parser.ts
│  │  └─ screenshot.ts
│  ├─ scenarios/
│  │  └─ login-success.json
│  └─ index.ts
└─ artifacts/
   ├─ results/
   └─ screenshots/
```

추가한 `environment`, `scenario-parser`, `redact`, `errors`는 브라우저 시작 전 입력 검증과 민감정보 제거를 코드 일부 생략 없이 구현하기 위한 최소 파일입니다.

## 3. 설치 명령어

```bash
npm install
npx playwright install chromium
```

## 4. 모든 파일의 전체 경로

각 파일에는 생략 없는 전체 코드가 들어 있습니다.

```text
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\package.json
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\package-lock.json
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\tsconfig.json
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\playwright.config.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\.env.example
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\.gitignore
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\index.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\types\scenario.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\types\result.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\constants\test-action.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\constants\test-status.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\locators\locator-resolver.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\actions\goto-action.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\actions\fill-action.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\actions\click-action.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\actions\assert-url-action.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\actions\assert-visible-action.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\runner\scenario-runner.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\runner\step-runner.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\collectors\console-collector.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\collectors\network-collector.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\utils\environment.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\utils\errors.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\utils\file.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\utils\redact.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\utils\scenario-parser.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\utils\screenshot.ts
C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\src\scenarios\login-success.json
```

## 5. `.env.example`

`.env.example`을 `.env`로 복사한 뒤 테스트 전용 값을 넣습니다.

```dotenv
TEST_BASE_URL=https://your-test-site.example
TEST_LOGIN_ID=qa-user
TEST_LOGIN_PASSWORD=replace-with-a-test-account-password
HEADLESS=true
```

## 6. 샘플 시나리오 JSON

`src/scenarios/login-success.json`은 다음 DOM 계약을 기대합니다.

- 로그인 URL: `/login`
- 아이디: `data-testid="login-id"`
- 비밀번호: `<label>`의 접근 가능한 이름이 `비밀번호`
- 버튼: role `button`, accessible name `로그인`
- 성공 URL에 `/dashboard` 포함
- 제목: `data-testid="dashboard-title"`

비밀번호 평문은 JSON에 없으며 `{{TEST_LOGIN_PASSWORD}}`만 저장됩니다.

## 7. 실행 방법

```bash
npm run test:scenario
```

다른 JSON을 실행하려면 `.env`에 프로젝트 root 기준 경로를 지정합니다.

```dotenv
SCENARIO_PATH=src/scenarios/login-success.json
```

누락된 placeholder가 하나라도 있으면 Chromium을 시작하기 전에 변수 이름과 함께 종료합니다.

## 8. 정상 실행 시 예상 결과

```text
시나리오: 로그인 성공

전체 단계: 6
성공: 6
실패: 0
중단: 0
오류: 0

최종 상태: success
결과 파일: artifacts/results/login-success__....json
```

결과 JSON에는 단계별 시각·시간·expected/actual·현재 URL과 console/network 수집 결과가 포함됩니다.

## 9. 실패 테스트 방법

- `assert-dashboard-title`의 testId를 존재하지 않는 값으로 변경하면 6단계가 `failed`가 되고 screenshot이 생성됩니다.
- 로그인 버튼 testId/role과 일치하는 요소를 두 개 만들면 locator가 첫 요소를 임의 선택하지 않고 해당 단계가 `error`가 됩니다.
- 잘못된 비밀번호를 사용해 URL assertion이 실패하면 이후 필수 단계가 `blocked`가 됩니다.
- `stopOnFailure`를 `false`로 바꾸면 실패 후에도 다음 단계를 계속 실행합니다.

실패 실행은 테스트 명령의 exit code를 1로 반환하므로 CI에서도 실패를 감지할 수 있습니다.

## 10. 현재 구현의 한계

- Chromium 한 종류와 단일 page만 지원합니다.
- iframe, popup, 새 탭, shadow DOM 전용 처리는 없습니다.
- HTTP/HTTPS scheme만 검사하며 SSRF·사설 IP 차단은 아직 없습니다.
- 결과는 로컬 파일이며 DB·object storage가 없습니다.
- generic click 이후 안정성은 Playwright actionability와 다음 assertion의 조건 대기에 의존합니다.
- request/response body와 header는 민감정보 위험 때문에 수집하지 않습니다.
- 자동 retry, queue, 병렬 실행, 영상, trace는 없습니다.

## 11. 다음 개발 단계

1. fixture 기반 자동 통합 테스트와 JSON Schema 추가
2. URL/IP/redirect SSRF 방어
3. Docker 기반 비권한 격리 runner
4. DB 작업 queue와 실행 이력
5. 프로젝트·시나리오 CRUD API

AI 자연어 변환은 실행 엔진과 보안 경계가 안정화된 뒤 연결하는 것이 안전합니다.
