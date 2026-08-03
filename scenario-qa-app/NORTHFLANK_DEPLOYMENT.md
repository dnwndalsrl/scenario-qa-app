# Northflank 무료 Sandbox 배포 가이드

이 문서는 `scenario-qa-app`과 `scenario-test-runner`를 한 Git 저장소에서 빌드해 Northflank **Developer Sandbox**의 Combined Service로 검증 배포하는 절차다. 무료 검증 배포와 상용 운영은 구분한다. 결제 수단 등록, 유료 리소스 생성, 플랜 전환은 이 절차에 포함하지 않는다.

## 1. 무료 Sandbox 사용 목적

목표는 외부 HTTPS 접속, 서버 인증, Nuxt API, 단일 Chromium 테스트, 실패 스크린샷까지 최소 기능을 검증하는 것이다. 무료 Sandbox는 상용 SLA, 장기 데이터 보존, 민감한 운영 계정 테스트를 전제로 하지 않는다.

기본 제한은 테스트 동시 실행 1개, Chromium만 사용, 페이지 1개, 실행 180초, 로그 200건, 실패 스크린샷 5장이다. 영상과 상시 trace는 저장하지 않는다.

## 2. 계정 생성 또는 로그인

`https://app.northflank.com/login`에서 사용자가 직접 로그인한다. Google, GitHub, GitLab, Bitbucket 또는 Northflank 계정을 사용할 수 있다. Codex가 비밀번호, MFA, OAuth 승인을 대신 입력하거나 완료했다고 기록하지 않는다.

## 3. GitHub 연결

서비스 생성 과정의 Git provider 선택 화면에서 GitHub를 선택하고 저장소 접근 권한을 승인한다. 가능하면 이 저장소 하나만 접근하도록 제한한다. 비공개 저장소를 권장한다. OAuth 승인과 조직 SSO 승인은 사용자가 직접 수행한다.

## 4. Sandbox 프로젝트 생성

Northflank 대시보드에서 새 프로젝트 생성 동작을 선택하고 **Developer Sandbox**를 선택한다. 프로젝트 이름은 예를 들어 `scenario-qa-sandbox`, 지역은 사용자와 테스트 대상에 가까운 무료 지원 지역을 선택한다. 결제 또는 유료 업그레이드 화면이 나오면 중단한다.

## 5. Combined Service 생성

프로젝트 안에서 새 서비스 추가 동작을 선택하고 **Combined Service**를 선택한다. 서비스 이름 예시는 `scenario-qa-app`이다. Git 저장소와 `main` 브랜치를 연결한다. Combined Service는 빌드와 런타임 배포를 한 서비스에서 관리한다.

## 6. Dockerfile 설정

기존 Dockerfile을 그대로 사용한다.

```text
Dockerfile path: /scenario-qa-app/Dockerfile
Build type: Dockerfile
Runtime command: Dockerfile CMD 사용
```

Dockerfile은 Node.js 22, Playwright `1.62.1`, Chromium과 시스템 의존성을 설치하고 비-root UID/GID `10001`로 `.output/server/index.mjs`를 실행한다. `npm run dev`, privileged container, Docker socket, `--no-sandbox`는 사용하지 않는다.

## 7. Build context

빌드 context는 저장소 루트 `/`다. Dockerfile이 형제 디렉터리인 `scenario-test-runner`와 `scenario-qa-app`을 함께 복사하므로 context를 `scenario-qa-app`으로 좁히면 빌드가 실패한다.

```text
Repository root
├─ scenario-qa-app/Dockerfile
└─ scenario-test-runner/
```

## 8. 환경변수 등록

`.env.northflank.example`의 값을 Northflank 런타임 변수/secret 화면에 한 항목씩 등록한다. 실제 비밀값 파일을 커밋하지 않는다.

먼저 로컬에서 인증 값을 생성한다.

```powershell
npm run auth:generate
```

출력된 `APP_AUTH_PASSWORD_HASH`와 `APP_SESSION_SECRET`만 Northflank secret으로 등록한다. 평문 비밀번호는 저장하지 않는다. OpenAI, Slack, SMTP 값은 첫 배포에서 비워 둔다.

초기 공개 주소를 아직 모르면 임시 HTTPS 형식의 값을 사용해 첫 배포한 뒤, endpoint 발급 직후 아래 세 값을 실제 주소로 교체하고 재배포한다.

```text
APP_BASE_URL
NUXT_PUBLIC_APP_BASE_URL
NOTIFICATION_APP_BASE_URL
```

Host 헤더는 알림 링크 생성 기준으로 사용하지 않는다.

## 9. Port 설정

공개 포트는 컨테이너 포트 `3000`, protocol은 HTTP, external/public 접근은 활성화한다. Northflank가 외부 TLS를 종료하므로 앱 내부에는 HTTP로 전달된다.

```text
HOST=0.0.0.0
PORT=3000
Public port=3000
```

## 10. Health check

서비스의 HTTP health check 경로는 인증 없이 가벼운 검사만 하는 `/api/health/live`, 포트는 `3000`으로 설정한다. 초기 지연은 최소 30초, timeout은 5초, interval은 30초를 권장한다. `/api/health/ready`는 저장소 쓰기, artifact 경로, 스케줄러 설정과 Playwright 설치 상태를 확인하지만 Chromium을 매번 시작하지 않는다. Readiness는 배포 후 인증 세션 또는 내부 점검에서 별도로 확인한다.

## 11. Public endpoint

포트 저장 후 Northflank가 생성한 `https://...code.run` endpoint를 확인한다. 주소를 세 base URL 변수에 반영해 새 배포를 실행한다. 다음을 확인한다.

```text
GET /api/health/live -> 200
GET /api/projects (비인증) -> 401
GET /login -> 로그인 화면
로그인 후 / -> 관리 화면
정적 /_nuxt 자산 -> 200
로그인 후 /system/status 새로고침 -> 200
```

## 12. Persistent volume 확인

Northflank의 서비스 저장소/volume 추가 화면에서 **무료 Sandbox에 비용 없이** `/app/storage`로 연결 가능한 volume이 실제로 표시되는지 먼저 확인한다. 유료 가격이나 결제 수단을 요구하면 생성하지 않는다.

- 사용 가능: `/app/storage`에 단일 read/write volume을 연결하고 `PERSISTENT_STORAGE_AVAILABLE=true`, `APP_DEMO_MODE=false`로 변경한다. UID/GID `10001` 쓰기 권한을 health readiness에서 확인한다.
- 사용 불가 또는 미확인: volume을 만들지 않고 `PERSISTENT_STORAGE_AVAILABLE=false`, `APP_DEMO_MODE=true`, `TEST_SCHEDULER_ENABLED=false`를 유지한다. 화면 배너대로 재시작·재배포 시 데이터와 artifact가 사라질 수 있는 데모로만 사용한다.

영속성 판정은 UI에 volume 메뉴가 있다는 사실만으로 완료하지 않는다. 임시 프로젝트 생성 후 서비스 restart와 새 deploy를 각각 수행해 ID가 그대로 조회되는지 확인한다.

## 13. Cron Job 생성

첫 배포에서는 예약 실행을 비활성화한다. 서비스와 영속 저장이 검증된 뒤 무료 Cron Job 1개만 대표 검증한다. Northflank의 새 job 생성 화면에서 Cron Job을 선택하되, 유료 리소스를 요구하면 중단한다. 동적 예약이 여러 개인 앱 내부 scheduler는 무료 Sandbox에서 실험 기능이다.

현재 앱에는 별도의 무인 Cron 전용 인증 endpoint가 없으므로, 공개 API에 관리자 세션을 하드코딩하는 Cron은 만들지 않는다. 대표 Cron 검증 전에는 최소 권한 토큰 방식의 전용 endpoint를 별도 구현해야 한다.

## 14. 배포 로그 확인

Build logs에서 두 workspace의 `npm ci`, Nuxt production build, Playwright 설치 성공을 확인한다. Deployment/runtime logs에서 환경 검증 실패, `EACCES`, `ENOSPC`, Chromium launch 오류, OOM/restart를 확인한다. 비밀번호, session secret, API key, webhook은 로그에 출력하지 않는다.

오류는 다음처럼 구분한다.

- 빌드 의존성 또는 Dockerfile 오류: `NORTHFLANK_BUILD_FAILED`
- health timeout 또는 restart loop: `NORTHFLANK_HEALTH_CHECK_FAILED`
- Chromium executable/launch 오류: `NORTHFLANK_CHROMIUM_START_FAILED`
- Northflank OOM 또는 자원 한도 증거: `NORTHFLANK_MEMORY_LIMIT_EXCEEDED` 또는 `FREE_SANDBOX_RESOURCE_LIMIT`
- volume 미제공/비영속 확인: `NORTHFLANK_VOLUME_NOT_AVAILABLE` 또는 `NORTHFLANK_STORAGE_NOT_PERSISTENT`

## 15. 재배포

연결 branch에 새 commit을 push하거나 Northflank UI의 재배포 동작을 사용한다. 배포 중에는 단일 테스트가 실행 중이지 않은지 확인한다. 새 deploy 후 health, 로그인, 프로젝트 조회, Chromium smoke test를 다시 실행한다.

## 16. Rollback 가능한 범위

이미지/배포 이력이 UI에 남아 있으면 직전 성공 deployment로 되돌릴 수 있다. 코드 rollback은 Git revert commit을 `main`에 push하는 방식이 가장 명확하다. volume 데이터 schema를 되돌리는 자동 migration은 없으므로 JSON 파일 호환성이 깨지는 변경은 먼저 백업해야 한다. ephemeral mode에서는 rollback이 데이터 복구를 의미하지 않는다.

## 17. Smoke test

배포 후 비밀번호는 환경변수로만 주입하고 아래 명령을 실행한다.

```powershell
$env:NORTHFLANK_PUBLIC_URL='https://<generated-domain>'
$env:SMOKE_TEST_USERNAME='<admin-user>'
$env:SMOKE_TEST_PASSWORD='<plaintext-used-only-in-this-process>'
npm run smoke:northflank
Remove-Item Env:SMOKE_TEST_PASSWORD
```

스크립트는 HTTPS, 공개 liveness, 비인증 API 401, 로그인, Nuxt 자산, 프로젝트/시나리오 생성, 성공 Chromium 실행, 의도된 실패, 인증된 PNG artifact 조회, 상태 화면을 검사하고 임시 프로젝트를 삭제한다. `SMOKE_PRESERVE_PROJECT=true`일 때만 데이터를 남긴다.

로컬 Docker 호스트에서는 다음 사전 검사를 실행한다.

```powershell
npm run preflight:northflank
```

Docker가 없는 PC에서는 `npm run preflight:northflank:verify -- --static`으로 typecheck, test, build까지만 검사한다. Docker build/run/Chromium 검사를 통과한 것으로 간주해서는 안 된다.

## 18. 무료 플랜 제한

Developer Sandbox의 현재 quota와 인스턴스 CPU/메모리는 계정 UI에서 최종 확인한다. 문서상 Sandbox는 상용 production 용도가 아니다. 앱은 병렬 실행, 다중 브라우저, 대량 artifact, 빈번한 scheduler를 제한한다. OpenAI API 사용료와 이메일/Slack 서비스 비용은 Northflank 무료 배포와 별개다.

무료 메모리에서 Chromium OOM이 확인되면 먼저 한 시나리오/한 page/짧은 timeout을 유지하고, 실제 오류가 `/dev/shm` 관련일 때만 `PLAYWRIGHT_DISABLE_DEV_SHM_USAGE=true`로 바꾼다. `--no-sandbox`는 설정하지 않는다. 그래도 실패하면 UI 데모만 가능한 것으로 판정한다.

## 19. 데이터 유실 가능성

`PERSISTENT_STORAGE_AVAILABLE=false`인 동안 `/app/storage`는 임시 filesystem이다. 플랫폼 restart, 새 deploy 또는 reschedule 때 프로젝트, 시나리오, 결과, 스크린샷과 알림이 초기화될 수 있다. 중요한 계정, 개인정보, 운영 비밀번호, 장기 통계는 저장하지 않는다. 예약 실행과 장기 분석은 비활성화한다.

volume이 검증되더라도 artifact는 실패 실행당 최대 5장, 기본 7일, 총 200MB 정책을 사용한다. 현재 용량/보관 기준 검사는 제공하지만 자동 artifact 삭제는 별도 운영 검토 없이 메타데이터와 파일을 임의 삭제하지 않는다.

## 20. 유료 전환이 필요한 조건

다음 중 하나가 필요하면 무료 검증 범위를 벗어난다.

- 상용 SLA와 안정적인 always-on 운영
- 실제 계정으로 반복 테스트하거나 민감한 artifact 보관
- 검증된 persistent volume, 백업, 복원 및 데이터 내구성
- Chromium 동시 실행 2개 이상 또는 3분을 넘는 스위트
- 여러 동적 예약, 다중 replica, 무중단 배포
- 200MB를 넘는 artifact 또는 7일을 넘는 보존
- 무료 인스턴스에서 반복되는 OOM, timeout, restart loop

유료 전환은 사용자가 비용과 데이터 이전 계획을 승인한 뒤 별도 작업으로 진행한다.

## 배포 적합성 판정표

| 항목 | 판정 | 근거 또는 다음 검증 |
|---|---|---|
| Dockerfile / production CMD | 정상 | root context build, `.output/server/index.mjs` |
| Node.js / Playwright 버전 | 정상 | Node 22, Playwright package와 Chromium install `1.62.1` |
| `0.0.0.0` / `PORT` | 정상 | Dockerfile `HOST`, `PORT=3000`, Nuxt production server |
| public port / TLS | 실제 배포 후 검증 필요 | Northflank port 3000 endpoint 발급 필요 |
| liveness / readiness | 정상 | live는 공개, ready는 운영 상태 검사 |
| 비-root / writable storage | 실제 배포 후 검증 필요 | UID 10001, `/app/storage`; volume ownership 확인 필요 |
| Chromium 공유 메모리 | 실제 배포 후 검증 필요 | 기본 sandbox 유지, 오류 증거가 있을 때만 shm 우회 |
| 테스트 동시성 | 정상 | 앱 runner lock과 suite 동시 실행 비활성화 |
| 무료 CPU / 메모리 | 무료 플랜에서 제한 | 계정 UI와 실제 resource snapshot/OOM 로그로 판정 |
| persistent volume | 실제 배포 후 검증 필요 | 무료로 attach 가능한지와 restart/redeploy 보존 확인 |
| Cron Job | 무료 플랜에서 제한 | 무료 quota 확인 후 대표 1개; 초기에는 비활성화 |
| 플랫폼 sleep / restart | 실제 배포 후 검증 필요 | 배포 이벤트와 uptime 로그 확인 |
| 앱 인증 | 정상 | scrypt hash, HMAC 세션, Secure HttpOnly SameSite cookie, rate limit |
| Nginx / Certbot / Compose | 지원되지 않음(기본 경로 제외) | Northflank TLS/라우팅 사용; VPS 파일은 보존 |

## Combined Service 설정 요약

```text
Service type=Combined Service
Repository=<GitHub repository>
Branch=main
Build type=Dockerfile
Dockerfile path=/scenario-qa-app/Dockerfile
Build context=/
Internal port=3000
Public protocol=HTTP (Northflank HTTPS termination)
Health path=/api/health/live
Health port=3000
Volume mount=/app/storage (무료 제공이 실제 확인된 경우만)
Replicas=1
```

## 북마크용 배포 결과

실제 계정 작업이 끝날 때 아래 값을 채운다. 로그인, GitHub 권한 승인, 공개 endpoint 발급 전에는 빈 값을 성공으로 해석하지 않는다.

```text
NORTHFLANK_PROJECT=
NORTHFLANK_SERVICE=
NORTHFLANK_PUBLIC_URL=
DEPLOY_BRANCH=main
DEPLOY_COMMIT=
PERSISTENT_STORAGE_AVAILABLE=UNVERIFIED
PLAYWRIGHT_AVAILABLE=UNVERIFIED
CRON_AVAILABLE=UNVERIFIED
FINAL_STATUS=BLOCKED_PENDING_USER_LOGIN
```
