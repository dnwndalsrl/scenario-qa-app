# Scenario QA 실사용 준비 보고서

생성일: 2026-08-03 (Asia/Seoul)  
최종 판정: `ready_with_warnings`

## 1. 현재 애플리케이션 상태 요약

Nuxt 4 관리 화면, Playwright 실행기, JSON 저장소, 스위트, 예약, 알림, 회귀 비교, AI 보조 기능과 대시보드는 유지하면서 실사용 안정화 작업을 완료했다. 최종 프로덕션 번들에서 핵심 시나리오 30/30회가 성공했고, 알려진 민감값의 JSON 노출은 0건이다. 실제 staging URL과 이메일/Slack 자격 증명이 제공되지 않아 로컬 샘플 대상과 인앱 알림까지만 실전 검증했다.

## 2. 실사용 검증 범위

- 대상: `http://127.0.0.1:3000` 로컬 QA 샘플(사용자 제공 실제 URL이 없어 우선순위 1 적용)
- 앱: 프로덕션 Node 서버 `http://127.0.0.1:3107`
- 기능: 로그인 성공/실패, 목록 조회, 개별/스위트/예약 실행, 결과·증거·알림, 재시작, 저장소, 보안, 성능
- 제외: 삭제·결제·탈퇴·실제 외부 발송·운영 데이터 변경

## 3. 실제 테스트 사이트 연결 방법

`.env`의 `TEST_TARGET_BASE_URL`과 `TEST_TARGET_ENVIRONMENT`를 실제 개발 또는 staging 값으로 바꾸고 앱을 재시작한다. 운영에서는 `ALLOW_LOCAL_TEST_TARGETS=false`가 기본이며, 로컬 개발에서만 허용 포트를 명시한다. 프로젝트 URL은 등록 시와 Playwright의 문서 이동·리다이렉트 시 모두 다시 검증된다.

## 4. 환경변수 구성

필수 계정값은 `.env`에만 두고 시나리오는 `{{TEST_LOGIN_ID}}`, `{{TEST_LOGIN_PASSWORD}}`, `{{TEST_INVALID_LOGIN_ID}}`, `{{TEST_INVALID_LOGIN_PASSWORD}}`만 사용한다. `.env.example`에는 대상 URL, 계정, SSRF, Playwright 경로, 보존 기간, 저장 한도, 개수/실행/로그/스크린샷 한도를 문서화했다. `.env`는 Git 제외 대상이다.

## 5. 핵심 시나리오 목록

1. `scenario-login-success`: 로그인 후 `/dashboard`와 `dashboard-title` 확인
2. `scenario-login-failure`: 잘못된 계정으로 실패 메시지와 `/login` 유지 확인
3. `scenario-items-list`: 로그인 후 `/items`, 제목과 빈 상태 확인

데이터 생성·수정 시나리오는 이번 범위에서 제외해 업무 데이터 영향이 없다.

## 6. selector 안정화 방법

핵심 입력·버튼·제목·빈 상태·오류 메시지는 모두 `data-testid`를 사용한다. 로그인 실패 메시지는 `role=alert`와 accessible name 조합이 실제 DOM에서 0개로 해석된 문제를 `data-testid=login-error`로 교체했다. `nth-child`, 해시 클래스, 긴 CSS 선택자는 핵심 시나리오에 없다.

## 7. 반복 실행 결과

최종 프로덕션 번들, Chromium `151.0.7922.34`, headless, viewport `1440x900`에서 실행했다.

| 시나리오 | 실행 | 성공 | 안정성 | 평균 | 최소 | 최대 | 콘솔/네트워크 오류 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 로그인 성공 | 10 | 10 | 100% | 777.6ms | 732ms | 803ms | 0 / 0 |
| 로그인 실패 | 10 | 10 | 100% | 748.5ms | 716ms | 793ms | 0 / 0 |
| 주요 목록 조회 | 10 | 10 | 100% | 759.1ms | 722ms | 812ms | 0 / 0 |

원본은 `readiness-stability-final.json`, 집계는 `readiness-stability-summary.json`에 저장했다.

## 8. 간헐적 실패 목록

초기 반복에서는 Windows JSON 교체의 간헐적 `EPERM`과 잘못된 오류 메시지 locator로 90% 수준의 결과가 발생했다. 실패를 보존해 원인을 확인한 뒤 수정했고, 최종 표본의 간헐 실패는 0건이다. 브라우저 설치 전 오류와 Playwright 실행 파일 부재도 별도 오류로 확인했다.

## 9. 수정한 안정성 문제

- 저장 완료 상태를 인메모리 실행 잠금 해제 뒤 게시해 다음 실행과의 경합 제거
- Windows 원자 교체에 읽기/쓰기 파일 잠금, swap 복구, 제한 재시도 적용
- `role` locator를 안정적인 testId로 교체
- readiness가 전체 실행을 읽던 구조를 시나리오별 최신 10건으로 축소
- 샘플의 수집기 데모용 콘솔 경고와 404 요청 제거

## 10. 민감정보 점검 결과

환경변수 실제 값은 실행 결과, 콘솔/네트워크, 비교, AI 입력, 운영 로그에서 `[REDACTED]`로 치환된다. 과거 결과 7개 파일을 마이그레이션했다. 실패 스크린샷에서 아이디 입력값 노출을 발견해 input/textarea/select/contenteditable 중 민감값 보유 요소를 촬영 시 마스킹하도록 수정했다. 노출 가능 스크린샷 9개와 고아 1개를 삭제했고, 새 마스킹 스크린샷을 육안 확인했다. 현재 readiness의 알려진 민감값 JSON 검색 결과는 0건이다.

## 11. URL 및 SSRF 점검 결과

`http`/`https`만 허용하고 credential 포함 URL, `file`, `ftp`, `data`, `javascript`, metadata 주소와 사설/로컬 주소를 기본 차단한다. 비프로덕션에서 `ALLOW_LOCAL_TEST_TARGETS=true`이고 포트가 allowlist에 포함될 때만 localhost를 허용한다. 최초 URL과 브라우저 문서 이동/리다이렉트에 동일 정책을 적용하며 관련 보안 테스트가 통과했다.

## 12. 테스트 계정 및 세션 점검

각 실행은 새 BrowserContext를 만들며 권한 요청과 다운로드를 차단하고 실행 후 page/context/browser를 `finally`에서 닫는다. 최종 30회에서 세션 잔존 영향은 없었다. 계정은 로컬 QA 전용이며 입력값은 결과와 스크린샷에서 마스킹된다. 실제 staging 계정의 만료·잠금·업무 권한은 실제 계정 제공 후 별도 확인이 필요하다.

## 13. 테스트 데이터 관리

이번 시나리오는 읽기와 세션 범위 동작만 사용해 영구 업무 데이터를 만들지 않는다. 향후 등록/수정 테스트는 `[AUTO-TEST]` 접두어, 실행별 고유 ID, 정리 결과 기록을 전제로 staging에서만 추가해야 한다.

## 14. 예약 실행 점검

`매일 관리자 기본 기능 점검`, 매일 09:00, `Asia/Seoul`, 동시 실행 `skip`, 놓친 실행 `run_once` 예약을 활성화했다. 다음 실행은 `2026-08-04T00:00:00.000Z`(KST 09:00)다. 수동 예약 트리거 `schedule-execution-9f9e6cf5-fe9f-445c-ac6a-e2b938e4d0b0`은 suite run과 연결되어 3/3 성공했다. 중복/놓친 실행 계산은 테스트로 검증했지만 실제 벽시계 09:00 장기 관찰은 아직 수행하지 않았다.

## 15. 알림 점검

인앱 성공·실패 이력과 예약 성공 알림을 실제 생성했고, 최신 알림에는 프로젝트, 예약명, suite run ID와 상세 실행 링크가 포함된다. 외부 알림 본문도 프로젝트·스위트·상세 URL을 포함하고 재시도 횟수는 제한된다. 이메일/Slack은 자격 증명이 없어 실제 발송하지 않았으며, adapter/실패 경로는 자동 테스트까지만 확인했다. 외부 알림 실패가 테스트 상태를 바꾸지 않는 구조는 유지된다.

## 16. 서버 재시작 점검

프로덕션 서버를 중지·재기동한 뒤 프로젝트, 최신 성공 실행, 활성 예약, `nextRunAt`, 알림 5건이 유지됨을 확인했다. 시작 시 stale `pending/running/processing/sending` 실행은 오류 코드와 재시작 중단 메시지로 terminal 상태에 복구한다. 완료 데이터 보존은 실제 재시작으로 확인했으며, 모든 종류의 실행 중 작업을 동시에 중단하는 장기 장애 실험은 수행하지 않았다.

## 17. storage 점검

현재 254개 파일, 9.56MB이며 프로젝트 1, 시나리오 3, test run 267, suite run 7, schedule execution 5건이다. 쓰기는 임시 파일→JSON 검증→bounded backup→교체 순서이며 Windows swap 복구와 파일 잠금을 적용했다. 백업은 파일별 최대 5개다. 5개의 실패 잔여 임시 파일(2.65MB)을 수동 정리했고 현재 cleanup candidate는 0건이다. 90일 결과/30일 artifact/1GB 상한은 설정 가능하며 자동 삭제 대신 조회·수동 명령을 제공한다. 과거 결과를 삭제하면 대시보드 통계와 비교 근거가 줄어든다.

## 18. 성능 및 응답 속도 점검

프로덕션 서버에서 각 5회 측정했다. 267개 실행 기준 median은 프로젝트 목록 9.5ms, 시나리오 12.7ms, 실행 이력 16.2ms, 실행 상세 6.1ms, 비교 1.1ms, 예약 1.5ms, 알림 0.7ms다. 대시보드 summary/timeseries는 warm median 1.7/2.0ms지만 cold max 3.00/2.87초였다. readiness는 최신 30개 상세와 201개 결과 파일의 민감값 검색 때문에 median 400.5ms다. 전체 수치는 `readiness-performance.json`에 데이터 개수와 함께 기록했다. 1만 실행, storage 1GB, 또는 cold p95 3초 초과가 지속되면 DB/인덱스·페이지네이션 전환을 권장한다.

## 19. 브라우저 리소스 점검

Chromium을 프로젝트 전용 `.playwright-browsers`에 설치했고 프로덕션 번들에서 실제 실행했다. headless, viewport 1440×900, permissions 없음, downloads 차단, 실행/스크린샷/로그 한도 적용 상태다. 최종 실행 후 `headless_shell`, `playwright`, `chromium` worker 프로세스는 0개였다. 사용자 Chrome 프로세스는 검사·종료 대상에서 제외했다.

## 20. 배포 환경 점검

Nuxt production build와 runner TypeScript build가 성공했다. Node 단일 프로세스 번들을 3107 포트에서 기동하고 Playwright 성공 실행 및 재시작을 확인했다. storage/artifacts 쓰기와 환경변수 로딩도 성공했다. 실제 원격 Node/Docker 서버, 외부 네트워크, SMTP, Slack은 제공되지 않아 검증하지 않았다. 서버리스는 대상에서 제외한다.

## 21. 발견 문제 목록

| ID | 심각도 | 문제 | 상태/해결 |
|---|---|---|---|
| RD-001 | high | Chromium 버전 실행 파일 없음 | fixed: 전용 브라우저 설치/경로 설정 |
| RD-002 | high | 로그인 실패 메시지 role locator 오탐 | fixed: testId 적용 |
| RD-003 | high | Windows JSON rename 간헐 EPERM | fixed: lock/swap/retry/recovery |
| RD-004 | critical | 과거 결과의 테스트 계정 값 | fixed: 7파일 마스킹 |
| RD-005 | critical | 실패 스크린샷의 아이디 값 | fixed: 촬영 마스크, 기존 9개 삭제 |
| RD-006 | high | URL 이동 단계 SSRF 재검증 부재 | fixed: 모든 document navigation guard |
| RD-007 | medium | 성공 흐름의 데모 콘솔/404 잡음 | fixed: 제거, 최종 0건 |
| RD-008 | medium | readiness 전체 실행 상세 스캔 | fixed: 시나리오별 최신 10건 |
| RD-009 | medium | 실제 staging·외부 알림 미검증 | accepted: 자격 증명 필요 |
| RD-010 | medium | JSON 단일 노드 확장성 | accepted: 전환 기준 설정 |

## 22. 수정 내용

SSRF 정책/브라우저 이동 guard, 민감값 확장 및 운영 로그 정제, 브라우저·viewport 증거, 실행 오류 코드, 상태 게시 경합 수정, Windows 저장 복구, bounded backup, 시작 시 orphan 상태 복구, 개수·시간·로그·스크린샷 한도, 보존 설정과 storage 점검/정리 스크립트, 스크린샷 민감 입력 마스크, 알림 상세 링크, readiness API/화면을 추가·보완했다.

## 23. 회귀 테스트 결과

- 앱: 39개 test file, 136개 test 모두 통과
- runner: 민감 환경변수 테스트 통과
- 앱/runner typecheck 통과
- 앱/runner production build 통과
- 프로덕션 Playwright 실제 실행 통과
- 상태 증거: actual failed+blocked 실행, 내부 error 실행, disabled suite item skipped 실행(`suite-run-0177892b-3d51-411e-9978-240083ccf8cb`, 2 success/1 skipped)
- 회귀 비교 최신 결과는 성공 유지이며, 제거한 콘솔/404는 resolved로 기록됨

## 24. 실사용 준비 체크리스트

| 항목 | 상태 |
|---|---|
| URL 정책/SSRF | 통과 |
| 테스트 계정 환경변수 | 통과(로컬 계정) |
| 핵심 시나리오 3개 | 통과 |
| selector 안정성 | 통과 |
| 각 10회 반복 | 통과, 모두 100% |
| 민감정보 JSON/스크린샷 | 통과 |
| 예약 실행/suite 연결 | 통과 |
| 인앱 알림/상세 링크 | 통과 |
| 이메일/Slack 실발송 | 주의, 미검증 |
| 재시작/데이터 유지 | 통과 |
| storage/backup/cleanup | 통과 |
| production build/Chromium | 통과 |
| 실제 staging 대상 | 주의, 미제공 |

화면 경로는 `/projects/project-local-login/readiness`다.

## 25. 최종 판정

`ready_with_warnings`. 핵심 시나리오는 최종 100%, 민감정보 검색 0건, 예약·인앱 알림·재시작·프로덕션 Chromium 실행이 통과했다. 다만 실제 업무/staging 사이트와 이메일/Slack 실발송을 검증하지 않았고 JSON 단일 노드 구조의 장기 확장 한계가 남아 있어 `ready`로 과대 판정하지 않는다.

## 26. 현재 사용 가능한 범위

소규모 내부 팀이 단일 Node 인스턴스에서 개발/staging 사이트의 읽기 중심 시나리오, 수동/순차 스위트 실행, 예약 실행, 실패 증거, 인앱 알림, 회귀 비교, 대시보드와 readiness 확인에 사용할 수 있다.

## 27. 사용 시 주의사항

실제 URL·계정을 넣기 전에 staging 전용 계정과 권한을 준비한다. 운영의 삭제·결제·탈퇴·대량 수정·실제 발송은 자동화하지 않는다. 단일 인스턴스와 영구 볼륨을 사용하고 `.env`, storage, artifact 접근 권한을 제한한다. 외부 알림 자격 증명은 코드/JSON에 넣지 않는다. 보존 정리 전 통계·비교 영향과 백업을 확인한다.

## 28. 향후 우선 개선 항목

1. 실제 staging URL/계정으로 동일 30회 재검증
2. 테스트 전용 SMTP/Slack에서 성공·실패·부분 성공·회귀·건너뜀·예약 오류·전송 실패 실발송 검증
3. 실제 09:00 예약과 missed-run을 24시간 이상 관찰
4. 실행 이력 페이지네이션과 민감값 검사를 증분 인덱스로 변경
5. 1만 실행 또는 1GB 도달 전 PostgreSQL/작업 큐 전환 설계
