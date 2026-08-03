# Scenario QA 외부 배포 보고서

보고 시각: 2026-08-03 (Asia/Seoul)  
현재 판정: **배포 준비 완료 / 실제 외부 배포 대기**  
대기 사유: `<SERVER_IP>`, `<SSH_USER>`, `<DOMAIN>`, `<APP_DIRECTORY>` 및 사용할 SSH key 경로 또는 SSH agent 확인이 제공되지 않았다. 따라서 공개 URL, TLS, VPS Docker, 재부팅 검증을 사실과 다르게 완료 처리하지 않는다.

## 1. 현재 프로젝트 배포 가능성

Nuxt 4.4.8, Nitro 2.13.4 `node-server`, Node 22 기반으로 production build가 성공했다. TypeScript 검사 성공, Vitest 39개 파일/136개 테스트 성공, production 프로세스의 health API 성공, Playwright 1.62.1 Chromium 직접 실행 성공이다. 로컬 PC에는 Docker가 없어 Docker image build는 검증 대기다.

| 점검 항목 | 판정 | 근거 |
|---|---|---|
| package/build/Nitro | 정상 | `npm run build`, node-server |
| TypeScript | 정상 | `npm run typecheck` |
| unit/integration test | 정상 | 136/136 성공 |
| Playwright/Chromium | 정상(로컬) | production bundle launch/evaluate/close |
| production server | 정상(로컬) | live/ready/system status 모두 ok |
| Docker image | 검증 필요 | 로컬 Docker 미설치 |
| VPS/DNS/TLS | 미구현(입력 대기) | 서버 정보 미제공 |
| SMTP/Slack/OpenAI 실연동 | 검증 필요 | 실제 자격 증명 미제공 |

## 2. 권장 배포 아키텍처

사용자 → HTTPS Nginx(Basic Auth) → Docker 내부 `app:3000` → Nuxt API/Playwright Chromium → bind mount storage/artifacts 구조다. app 3000은 외부에 publish하지 않는다. Certbot은 HTTP-01 발급/갱신 시에만 실행한다.

## 3. 서버 요구 사양

초기 권장은 Ubuntu LTS, 2 vCPU 이상, RAM 4GB 이상, Disk 30GB 이상이다. 동시 실행은 1개로 제한한다. Chromium 실제 메모리/CPU와 artifact 증가율은 VPS에서 1주간 관찰 후 조정해야 한다.

## 4. 도메인 및 DNS 준비사항

`<DOMAIN>` A 레코드를 `<SERVER_IP>`로 지정하고 TTL 300 또는 기본값을 사용한다. AAAA는 IPv6 라우팅이 실제 준비된 경우만 둔다. `scripts/verify-dns.sh`로 확인한다.

## 5. 최종 폴더 구조

`<APP_DIRECTORY>/scenario-qa-app`, `<APP_DIRECTORY>/scenario-test-runner`를 형제로 배치한다. 운영 데이터는 `scenario-qa-app/data/{storage,artifacts,backups,logs,nginx,certbot}`에 저장한다. 앱 컨테이너에는 storage/artifacts와 읽기 전용 backups만 최소 mount한다.

## 6. Dockerfile

Node 22 Bookworm multi-stage build, exact Playwright 1.62.1 Chromium+OS dependency 설치, UID/GID 10001 비-root 실행, dumb-init, SIGTERM, OCI version label, liveness healthcheck를 구성했다. 최종 이미지는 `.output`만 복사한다.

## 7. `.dockerignore`

부모 build context와 앱 디렉터리에 각각 작성했다. `.env*`, storage, artifacts, logs, node_modules, build output, Git/IDE 파일을 제외하고 `.env.production.example`만 다시 포함한다.

## 8. Docker Compose

`app`, `nginx`, profile형 `certbot`으로 구성했다. app은 `restart: unless-stopped`, 3GB/2CPU 상한, 1GB `/dev/shm`, read-only root, tmpfs, 모든 capability drop, no-new-privileges, health dependency, 로그 회전을 적용했다.

## 9. 운영 환경변수

`.env.production.example`에 현재 코드와 배포 도구가 사용하는 변수를 포함했다. 비밀값은 모두 빈 값이며 실제 `.env.production`은 Git과 Docker context에서 제외한다. 필수값/선택 기능 종속성은 startup plugin과 배포 스크립트가 이중 검증한다.

## 10. 영구 저장 볼륨

`data/storage:/app/storage`, `data/artifacts:/app/storage/artifacts`, `data/backups:/app/backups:ro`다. 프로젝트, 시나리오, 실행/스위트/예약/AI/비교/알림 JSON과 screenshot/result artifacts가 컨테이너 재생성 후 유지되도록 했다. 실제 `down/up`과 reboot 영속성은 VPS에서 검증 대기다.

## 11. Chromium 설정

Playwright bundle과 동일한 1.62.1 CLI로 Chromium을 이미지에 설치한다. `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, `shm_size: 1gb`, non-root를 사용하며 `--no-sandbox`, privileged, Docker socket은 사용하지 않는다. VPS 컨테이너 smoke test는 `scripts/verify-chromium.sh`다.

## 12. Nginx 설정

잘못된 Host 444, HTTP→HTTPS, reverse proxy, WebSocket, forwarded headers, 5MB body, 일반 60초/AI 120초 timeout, static cache, 서버 버전 은닉을 적용했다. 인증서 발급 전 bootstrap 설정은 ACME challenge 외 요청을 503으로 닫는다.

## 13. Basic Authentication

화면/API/artifact/status를 모두 보호하고 `/api/health/live`만 공개한다. `create-basic-auth.sh`는 14자 이상 암호를 숨김 입력받아 APR1 hash만 `.htpasswd`에 저장하고 plaintext를 저장/출력하지 않는다.

## 14. HTTPS 인증서

Certbot webroot HTTP-01, 초기 발급, 최종 Nginx 전환, renew, Nginx test/reload, 인증서 목록 확인을 구현했다. 실제 인증서 발급은 DNS와 서버가 제공되어야 가능하다.

## 15. 방화벽 및 SSH 보안

UFW는 SSH/80/443만 허용한다. app 3000은 Docker 내부 expose만 한다. Ubuntu provisioning 스크립트를 제공했으며 root/password SSH 차단은 key 로그인 검증 후 수동 적용하도록 안전 절차를 문서화했다.

## 16. Health check

`/api/health/live`, `/api/health/ready`, `/api/health`를 구현했다. ready는 storage/artifacts 쓰기, Chromium executable, scheduler, runner admission을 검사하며 비밀값·내부 경로를 반환하지 않는다. 로컬 production 응답은 모두 ok였다.

## 17. 배포 스크립트

환경 검증→디렉터리 권한→active job 차단→현재 이미지 기록→백업→버전 태그 build→컨테이너 교체→초기 TLS 또는 기존 TLS→health→실패 시 rollback→오래된 이미지 정리 흐름이다. `set -euo pipefail`을 적용했다.

## 18. 백업 스크립트

storage JSON 유효성 검사 후 storage, artifacts, `.env.production`, manifest를 권한 600의 `scenario-qa-backup-YYYYMMDD-HHMMSS.tar.gz`로 묶는다. 기본 count 10/day 30 보존 정책을 적용한다.

## 19. 복원 스크립트

archive 경로 traversal, manifest app/format, JSON을 확인하고 현재 데이터를 별도 백업한 후 앱만 중지해 교체한다. health 실패 시 이전 데이터를 되돌리며 실패 데이터도 보존한다. 실제 disaster-recovery rehearsal는 VPS에서 검증 대기다.

## 20. Rollback

직전 컨테이너 image ref와 배포 직전 backup을 기록한다. 새 health 실패 시 이전 image로 app/nginx를 다시 올리고 health를 재확인한다. JSON schema migration이 없는 현재 범위에서 code rollback을 우선한다.

## 21. 로그 관리

app/nginx/certbot에 json-file 10MB × 5개 회전을 적용했다. 기존 운영 logger의 식별자/상태/오류 코드 중심 기록과 sanitize 처리를 유지한다. 배포 스크립트는 비밀값을 출력하지 않는다.

## 22. Graceful shutdown

종료 시 scheduler를 먼저 중지하고 새 run admission을 503으로 차단한 뒤 최대 25초간 pending/running 작업 종료를 기다린다. dumb-init이 SIGTERM과 Chromium 자식 프로세스 정리를 담당하며 Compose grace period는 30초다. 비정상 중단 데이터는 기존 operational recovery가 error 상태로 복구한다.

## 23. 최초 배포 명령어

`DEPLOYMENT_RUNBOOK.md`의 서버 준비 후 `validate-environment.sh`, `prepare-directories.sh`, `create-basic-auth.sh`, `verify-dns.sh`, `deploy.sh`, `verify-chromium.sh` 순서다.

## 24. 업데이트 배포 명령어

소스를 업데이트한 뒤 `bash scripts/deploy.sh`를 실행한다. active job이 있으면 기본 중단되며 `FORCE_DEPLOY=true`는 영향이 확인된 비상 상황에서만 사용한다.

## 25. 외부 접속 검증

검증 목표는 HTTP 301, HTTPS 401, 올바른 Basic Auth 200, desktop/mobile asset load, 새로고침이다. 현재 `<DOMAIN>` 미제공으로 미실행이다.

## 26. Playwright 검증

로컬 production bundle의 Chromium launch/page evaluate/close는 성공했다. VPS 컨테이너에서 `verify-chromium.sh`와 실제 외부 로그인 성공/실패 시나리오 및 screenshot/console/network 결과를 재검증해야 한다.

## 27. 예약 실행 검증

코드 테스트와 기존 로컬 실사용 준비도 검증은 성공했다. VPS에서 Asia/Seoul 예약, UTC 저장, nextRunAt 갱신, 중복 없음, 재시작 유지 검증은 대기다.

## 28. 알림 검증

인앱 알림 코드는 기존 검증 범위다. SMTP/Slack 자격 증명이 없어 실제 전달, 외부 상세 링크, 민감정보 미포함 검증은 대기다. 공개 URL은 고정 `NOTIFICATION_APP_BASE_URL`만 사용하도록 반영했다.

## 29. 데이터 영속성 검증

bind mount와 atomic JSON/recovery 코드는 구성했다. 실제 컨테이너 `down/up`, VPS reboot, CRUD/result/screenshot/schedule/notification 유지 검증은 아직 수행하지 않았다.

## 30. 서버 재부팅 검증

Docker와 두 서비스의 `unless-stopped` 재시작 정책은 구성했다. 실제 `sudo reboot` 이후 HTTPS, mount, scheduler 단일 시작, recovery는 VPS가 제공된 후 검증한다.

## 31. 보안 점검 결과

비-root app, no privileged/socket, minimal mounts, Basic Auth, HTTPS-only final config, Host 차단, body limit, 보안 헤더, secret ignore, SSRF 기존 방어, local target production 차단을 반영했다. CSP는 Nuxt/Element Plus 호환을 위해 inline script/style을 현재 허용하며 nonce/hash 전환이 후속 hardening 항목이다.

## 32. 배포 완료 보고서

현재 공개 배포 URL: **없음(배포 전)**. 목표 URL은 `https://<DOMAIN>`이다. 이미지 태그/배포 시각/TLS/마지막 health/Playwright/예약/알림 결과는 실제 서버 배포 후 `.deploy-state/deployments.log`와 본 절에 기록해야 한다.

## 33. 알려진 제한사항

로컬 Docker 부재, VPS/DNS 부재, 외부 테스트 target 네트워크 미검증, OpenAI/SMTP/Slack 실자격 증명 부재, 단일 서버/파일 저장소/동시 run 1개다. Docker build와 TLS가 성공하기 전 외부 배포 완료 조건은 충족되지 않는다.

## 34. 운영 시 주의사항

Basic Auth 암호와 `.env.production`을 비공개로 유지하고 backup도 외부 공개 경로에 두지 않는다. 배포 전 active job을 확인하며 restore/reboot는 업무 시간 밖에서 수행한다. disk/메모리/OOM, 인증서 갱신, backup 성공 여부를 정기 점검한다.

## 35. 다음 개선 단계

VPS 입력 후 실제 배포·25개 완료조건 검증이 최우선이다. 이후 앱 자체 사용자/권한, managed DB/object storage, remote runner 분리, CSP nonce/hash, off-site encrypted backup, 모니터링/경보, CI image scan/SBOM/signing 순으로 확장한다.
