# Scenario QA — 예약 실행 및 알림 MVP 구현 보고서

## 1. 이번 단계 구현 범위

기존 테스트 스위트를 일회·매일·매주·매월·Cron 일정으로 자동 실행하고, 앱·SMTP 이메일·Slack Incoming Webhook으로 결과를 알리는 기능을 구현했다. 예약 CRUD, 활성화, 즉시 실행, 실행 스냅샷, 누락·동시 실행 정책, 회귀 비교, 전달 이력, 자동·수동 재시도와 관리 화면을 포함한다.

## 2. 기존 구조와 연결 방식

스케줄러는 새 Playwright 엔진을 만들지 않는다. 예약 감지 후 기존 `TestSuiteRunService.requestRun()`과 `executeRun()`을 호출하므로 시나리오 스냅샷, runner, artifact, 결과 저장, 비교 기능을 그대로 재사용한다. 프로젝트·스위트 삭제 생명주기에는 예약, 실행, 알림 저장소 정리를 연결했다.

## 3. 추가 패키지

- `luxon`: IANA 시간대 변환과 DST 규칙
- `cron-parser`: 5필드 Cron 해석과 다음 실행 계산
- `nodemailer`: SMTP 이메일 전송
- `@types/luxon`, `@types/nodemailer`: strict TypeScript 타입

## 4. 환경변수

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `TEST_SCHEDULER_ENABLED` | `true` | 서버 스케줄러 활성화 |
| `TEST_SCHEDULER_TICK_INTERVAL_MS` | `15000` | 감지 주기 |
| `TEST_SCHEDULE_DEFAULT_TIMEZONE` | `Asia/Seoul` | 화면 기본 시간대 |
| `TEST_SCHEDULE_MAX_PER_SUITE` | `10` | 스위트별 최대 예약 |
| `TEST_SCHEDULE_MAX_PER_PROJECT` | `100` | 프로젝트별 최대 예약 |
| `TEST_SCHEDULE_MIN_INTERVAL_MINUTES` | `15` | Cron 최소 간격 |
| `TEST_SCHEDULE_EXECUTION_VERSION` | `v1` | 실행 레코드 버전 |
| `APP_BASE_URL` | `http://127.0.0.1:3100` | 알림 상세 링크 기준 |
| `NOTIFICATION_EMAIL_PROVIDER` | `disabled` | `smtp`일 때 이메일 활성화 |
| `NOTIFICATION_EMAIL_FROM` | 빈 값 | 발신 주소 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | 빈 값, `587`, `false` | SMTP 연결 |
| `SMTP_USER`, `SMTP_PASSWORD` | 빈 값 | SMTP 인증 |
| `NOTIFICATION_ENCRYPTION_KEY` | 빈 값 | Slack 비밀값 암호화, 16자 이상 |
| `NOTIFICATION_MAX_RETRY_COUNT` | `3` | 외부 알림 최대 시도 횟수 |
| `NOTIFICATION_RETRY_DELAY_MS` | `5000` | 지수 백오프 기준 |

## 5. 최종 폴더 구조

```text
shared/types/{test-schedule,notification}.ts
server/schedules/{services,types,utils}/
server/notifications/{adapters,services,utils}/
server/repositories/{test-schedule,test-schedule-execution,app-notification,notification-delivery}.repository.ts
server/api/projects/[projectId]/test-schedules/
server/api/{test-schedules,test-schedule-executions,notifications,notification-deliveries}/
server/plugins/test-scheduler.ts
components/schedule/ScheduleForm.vue
composables/use-{test-schedules,test-schedule-executions,notifications,notification-deliveries}.ts
pages/projects/[projectId]/schedules/
pages/notifications/index.vue
storage/{test-schedules,test-schedule-executions,app-notifications,notification-deliveries}.json
```

## 6. 예약 관련 타입

`TestSchedule`은 프로젝트·스위트 관계, 상태, 시간대, 일정 설정, 충돌·누락 정책, 알림 정책, `nextRunAt`과 최근 실행 메타데이터를 가진다. 공개 타입은 이메일을 마스킹하고 Slack은 `slackConfigured`만 반환한다. 저장 타입만 이메일 원문과 암호화된 Webhook을 가진다.

## 7. 일정 설정 타입

`TestScheduleConfig`는 `type` 판별자를 쓰는 union이다. `once`는 `runAt`, `daily`는 시·분, `weekly`는 일요일 0부터 토요일 6까지의 요일 배열, `monthly`는 일자와 `skip|last_day`, `cron`은 5필드 표현식을 사용한다. 요청의 `scheduleType`과 `scheduleConfig.type` 불일치는 거부한다.

## 8. 타임존 처리

시간대는 Luxon의 IANA 검증을 통과해야 한다. 저장되는 `nextRunAt`, `scheduledFor`, 시작·종료 시각은 UTC ISO 문자열이고 화면 미리보기는 선택한 시간대로 표시한다. DST의 존재하지 않는 시각과 중복 시각은 Luxon·cron-parser의 시간대 규칙을 따르며 동일 `(scheduleId, scheduledFor)`는 원자적 중복 검사로 한 번만 저장한다.

## 9. 다음 실행 시간 계산

`calculateNextRunAt()`이 모든 일정 타입의 다음 미래 시각을 계산한다. 월 29~31일이 없는 달은 설정에 따라 건너뛰거나 말일로 보정한다. `previewSchedule()`은 다음 5회 UTC·현지 시각과 사람이 읽을 수 있는 요약을 반환한다. 일회성 활성 예약은 미래 시각이 없으면 저장·재활성화를 거부한다.

## 10. Cron 검증

초 필드가 없는 정확한 5필드 표현식만 허용한다. 다음 100개 발생 시각의 차이를 검사해 기본 15분보다 짧은 간격을 차단한다. 잘못된 표현식은 `TEST_SCHEDULE_INVALID_CRON`, 짧은 간격은 `TEST_SCHEDULE_INTERVAL_TOO_SHORT`로 응답한다.

## 11. 놓친 실행 정책

서버 재시작 등으로 감지 시각이 tick 두 배 이상 늦으면 놓친 실행으로 본다. `skip`은 사유가 있는 `skipped` 실행 이력을 남기고 다음 미래 시각으로 이동한다. `run_once`는 놓친 구간에서 가장 최근 발생 시각을 한 번만 실행한다.

## 12. 동시 실행 정책

같은 스위트에 `pending|running` 실행이 있으면 `skip`은 건너뜀 이력을 남긴다. `queue_once`는 예약별 대기 실행을 최대 한 건만 유지하고 기존 실행 종료 후 다음 tick에서 처리한다. 프로세스 내 tick 재진입 방지와 schedule lock을 사용하며 `finally`에서 해제한다.

## 13. 예약 repository

네 저장소가 기존 원자적 JSON 쓰기와 파일 잠금을 재사용한다. 실행 저장소의 `createUnique()`는 `(scheduleId, scheduledFor)`를 동일 mutate 구간에서 검사한다. 프로젝트 삭제는 전달→알림→실행→예약 순서로 연결 데이터를 정리하고, 스위트 삭제는 관련 예약을 비활성화한다.

## 14. 예약 service

`TestScheduleService`가 프로젝트·스위트 소속과 활성 상태, 예약 개수, 알림 대상, 다음 시각을 검증하며 CRUD·미리보기·실행 상세를 제공한다. 편집 요청에서 비밀값을 비워 두면 기존 이메일/Webhook을 유지하고, 채널을 제거하면 관련 비밀값도 제거한다.

## 15. 예약 CRUD API

```text
GET/POST   /api/projects/:projectId/test-schedules
GET/PUT/DELETE /api/projects/:projectId/test-schedules/:scheduleId
POST /api/projects/:projectId/test-schedules/:scheduleId/activate
POST /api/projects/:projectId/test-schedules/:scheduleId/deactivate
POST /api/projects/:projectId/test-schedules/:scheduleId/run-now
POST /api/test-schedules/preview
GET  /api/projects/:projectId/test-schedules/:scheduleId/executions
GET  /api/test-schedule-executions/:executionId
```

기존 개발 중 사용한 `/schedules` 경로도 호환 별칭으로 유지한다. `run-now`는 `nextRunAt`을 바꾸지 않는다.

## 16. 예약 실행 타입

`TestScheduleExecution`은 `detected|queued|running|completed|skipped|failed`, `schedule|schedule_manual_trigger`, 예정·감지·시작·완료 시각, schedule snapshot, suite run 연결, 회귀 개수·comparison ID, 오류·건너뜀 사유와 버전을 저장한다. 스냅샷에는 실행 당시 이름, 스위트, 시간대, 일정·정책·알림 설정이 남는다.

## 17. 스케줄러 service

`TestSchedulerService.tick()`은 대기 실행을 먼저 재검사하고 due 예약을 순차 감지한다. due를 감지하면 다음 시각을 먼저 전진시키고 유일 실행 이력을 만든 뒤 충돌 정책을 적용한다. 실행 완료 후 이전 완료 스위트와 같은 시나리오의 test run을 비교해 회귀 개수와 comparison ID를 저장한다.

## 18. 서버 스케줄러 플러그인

Nitro 플러그인이 서버 시작 시 스케줄러를 시작하고 `close` hook에서 타이머를 정리한다. timer는 `unref()`되어 정상 종료를 방해하지 않는다. `TEST_SCHEDULER_ENABLED=false`이면 시작하지 않는다.

## 19. 스위트 실행 연결

`TestSuiteRun.trigger`에 `manual|schedule|retry|schedule_manual_trigger`를 저장하고, 예약 실행은 `scheduleTriggerInfo`에 schedule ID, execution ID, scheduledFor를 기록한다. 실제 실행은 기존 서비스 하나만 호출하므로 브라우저 격리, 실패 정책, artifact와 진행률 동작이 수동 실행과 동일하다.

## 20. 앱 내부 알림

성공, 실패, 부분 성공, 회귀, 예약 건너뜀·오류, 외부 전달 실패 타입을 지원한다. 전체·프로젝트별 목록, 읽음, 프로젝트 전체 읽음, unread count API를 제공한다. 프로젝트 삭제 시 알림도 삭제한다.

## 21. 이메일 adapter

Nodemailer SMTP adapter는 provider와 필수 설정이 있을 때만 전송한다. 제목과 본문에는 예약명, 공개 상태, UTC 예정 시각, 앱 상세 링크만 포함하며 환경변수 값, Slack URL, SMTP 비밀번호, raw provider 응답을 포함하지 않는다. 인증·설정 오류는 재시도하지 않는다.

## 22. Slack adapter

Webhook은 HTTPS `hooks.slack.com/services/...`만 허용하고 사용자 정보, query, fragment, redirect를 차단한다. AES-256-GCM과 무작위 IV·인증 tag로 암호화해 저장하며 API에는 원문을 반환하지 않는다. 요청은 10초 timeout과 `redirect: manual`을 사용한다.

## 23. 알림 재시도

각 채널 전달은 `NotificationDelivery`로 저장한다. 재시도 가능한 timeout, 네트워크, 429, 5xx는 최초 시도 후 기본 5·10·20초 지수 백오프로 최대 3회 재시도한다. 인증, 설정 누락, 잘못된 대상과 Slack 4xx는 즉시 종료한다. 실패해도 스위트 상태는 바꾸지 않으며 앱 실패 알림을 생성한다.

```text
GET  /api/notification-deliveries
GET  /api/test-schedule-executions/:executionId/notification-deliveries
POST /api/notification-deliveries/:deliveryId/retry
```

수동 재시도는 `failed`이면서 retryable인 전달만 허용한다.

## 24. 예약 목록 화면

프로젝트 예약 목록에서 상태, 스위트, 일정 타입, 시간대, 다음·최근 실행, 알림 채널을 확인하고 상세·즉시 실행·수정·활성화·비활성화·삭제를 수행한다. 프로젝트 상세에는 시나리오·스위트·예약 실행·실행 이력 탐색 메뉴를 추가했다.

## 25. 예약 생성 및 수정 화면

`ScheduleForm`은 일정 타입에 따라 날짜, 요일, 월 일자, Cron 입력을 동적으로 바꾼다. IANA 시간대 선택·직접 입력, 5회 미리보기, 충돌·누락 정책, 조건·채널, 이메일·Slack 설정을 한 폼에서 제공한다. 저장된 비밀값은 재표시하지 않는다.

## 26. 예약 상세 화면

예약 상태, 스위트, 다음 실행, 시간대와 실행 이력을 표시한다. 각 이력에서 상태, 예정 시각, 트리거, 스위트 결과, 회귀 개수를 확인하고 실행 상세로 이동한다.

## 27. 예약 실행 상세 화면

실행 상태·시각·회귀, 오류·건너뜀 사유, 불변 일정 스냅샷과 채널별 전달 상태·마스킹 수신자·시도 횟수·오류를 표시한다. retryable failed 전달에는 재전송 버튼을 제공한다.

## 28. 앱 알림 화면

상단 알림 링크에 unread badge를 표시한다. `/notifications`는 최신 알림, 읽지 않음 강조, 생성 시각, 관련 프로젝트·유형을 보여주며 항목 선택 시 읽음 처리한다. API는 전체와 프로젝트별 조회를 모두 지원한다.

## 29. 오류 처리

검증·존재·소속·한도·시간대·Cron·중복 실행·provider·target·delivery 상태에 구분된 코드와 한국어 행동 지침을 반환한다. 외부 제공자의 전체 응답, stack, secret, SMTP 인증값은 공통 API 응답에 포함하지 않는다. 알림 본문은 제어 문자를 제거하고 길이를 제한한다.

## 30. 단위 테스트

Luxon UTC 변환, 주간, 월말 보정, 5회 Cron 미리보기, 최소 간격, DST 전환, IANA 검증, 판별 union, AES-GCM, Slack allowlist, 이메일 마스킹, 5·10·20초 백오프를 검증한다. 전체 결과는 32개 테스트 파일, 114개 테스트 통과다.

## 31. 통합 테스트

실제 JSON repository를 임시 디렉터리에 구성해 due 예약 감지, 기존 suite gateway 호출, `schedule` trigger 저장, completed execution, 앱 알림과 sent delivery 생성까지 자동 검증한다. 별도 로컬 실행에서는 `schedule-execution-fa756f2f-8706-4740-b504-11ee6aa25815`가 `suite-run-9434cff0-2fe3-465f-b8de-94b046742f63`을 실행해 success가 됐다.

## 32. 실행 방법

```powershell
cd C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-qa-app
$env:TEST_LOGIN_ID='qa-user'
$env:TEST_LOGIN_PASSWORD='qa-password'
$env:PLAYWRIGHT_BROWSERS_PATH='C:\Users\User\Documents\Codex\2026-07-31\files-mentioned-by-the-user-saas\outputs\scenario-test-runner\.playwright-browsers'
npm run dev:target
```

다른 터미널에서 `npm run dev`를 실행하고 `http://127.0.0.1:3100/projects/project-local-login/schedules`를 연다. SMTP·Slack을 쓸 때만 해당 환경변수와 암호화 키를 추가한다.

## 33. 검증 절차

```powershell
npx nuxi typecheck
npm test -- --run
npm run build
```

그 다음 일회성 예약 미리보기, CRUD·활성 전환, `run-now`, suite run trigger, execution snapshot, 앱 알림, delivery 상세를 확인한다. 이메일·Slack은 별도의 안전한 테스트 계정에서 provider 설정 후 확인한다. 프로덕션 빌드도 성공했으며 의존성 sourcemap·대형 chunk 경고만 남는다.

## 34. 현재 한계

JSON 파일 잠금과 프로세스 메모리 lock은 단일 서버 인스턴스 기준이다. 다중 인스턴스에서는 완전한 중복 방지를 보장하지 않으므로 Redis lock, DB advisory lock, BullMQ 또는 외부 스케줄러가 필요하다. 이메일·Slack 실제 provider 연결은 자격 증명이 없어 자동·로컬 검증에서 제외했고 adapter·오류 분류·저장·재시도는 구현했다.

## 35. 다음 개발 단계

분산 lock과 durable queue, 전달 dead-letter 관리, 알림 보존 기간·삭제 UI, 권한별 수신 대상, provider별 rate limit, 운영 metrics·health endpoint를 추가한다. 이후 CI/CD trigger와 조직 단위 schedule ownership, 감사 로그, hosted secret manager로 확장하는 것이 적절하다.
