# Scenario QA 외부 배포 Runbook

이 문서는 Ubuntu VPS 한 대에 `scenario-qa-app`과 `scenario-test-runner`를 함께 배치하는 절차다. 실제 URL은 서버와 도메인이 준비된 뒤에만 확정한다.

## 1. 필요한 값

```text
SERVER_IP=<SERVER_IP>
SSH_USER=<SSH_USER>
DOMAIN=<DOMAIN>
APP_DIRECTORY=<APP_DIRECTORY>  # 권장: /opt/scenario-qa
```

SSH 암호나 개인 키 내용을 채팅, 저장소, `.env.production`에 넣지 않는다. 로컬 SSH agent 또는 개인 키 파일 경로만 사용한다.

## 2. DNS와 서버 준비

DNS A 레코드를 `<DOMAIN>` → `<SERVER_IP>`로 설정한다. IPv6로 서비스할 때만 올바른 AAAA 레코드를 추가한다. 잘못된 AAAA 레코드는 HTTPS 접속 실패를 만들 수 있으므로 제거한다.

서버 접속 후 호스트를 준비한다.

```bash
ssh <SSH_USER>@<SERVER_IP>
sudo mkdir -p <APP_DIRECTORY>
sudo chown <SSH_USER>:<SSH_USER> <APP_DIRECTORY>
cd <APP_DIRECTORY>/scenario-qa-app
DEPLOY_USER=<SSH_USER> SSH_PORT=22 bash scripts/provision-ubuntu.sh
```

Docker 그룹 반영을 위해 로그아웃 후 다시 접속한다. DNS 확인은 다음과 같다.

```bash
getent ahostsv4 <DOMAIN>
dig +short A <DOMAIN>
```

## 3. 소스 배치

Docker 빌드 컨텍스트에서 두 프로젝트가 형제 디렉터리여야 한다.

```text
<APP_DIRECTORY>/
├── scenario-qa-app/
└── scenario-test-runner/
```

Git 원격 저장소가 있으면 두 디렉터리를 clone한다. 원격 저장소가 아직 없다면 개발 PC의 `outputs/scenario-qa-app`과 `outputs/scenario-test-runner`를 SCP/SFTP로 위 구조에 전송한다. `.env`, `storage`, `.output`, `node_modules`는 전송하지 않는다.

```bash
cd <APP_DIRECTORY>/scenario-qa-app
cp .env.production.example .env.production
chmod 600 .env.production
vi .env.production
```

`<DOMAIN>`과 `<LETSENCRYPT_EMAIL>`을 교체하고 필요한 외부 테스트 계정, OpenAI, SMTP, Slack 설정만 입력한다. 비밀값은 화면이나 배포 로그에 출력하지 않는다.

## 4. 최초 배포

도메인이 서버 IP를 가리키고 80/443 포트가 열렸는지 먼저 확인한다.

```bash
cd <APP_DIRECTORY>/scenario-qa-app
chmod +x scripts/*.sh
bash scripts/validate-environment.sh
bash scripts/prepare-directories.sh
bash scripts/create-basic-auth.sh
bash scripts/verify-dns.sh
bash scripts/deploy.sh
bash scripts/verify-chromium.sh
```

최초 `deploy.sh`는 인증서가 없으면 bootstrap Nginx를 올리고 HTTP-01 인증서를 발급한 뒤 최종 HTTPS 설정으로 전환한다. 인증서 발급 전에는 앱 화면을 HTTP로 제공하지 않고 503으로 닫아 둔다.

## 5. 업데이트, 상태 확인, 로그

```bash
cd <APP_DIRECTORY>/scenario-qa-app
bash scripts/deploy.sh
bash scripts/health-check.sh
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=200 app nginx
```

진행 중인 테스트·스위트·AI 분석·예약 실행·알림 전송이 있으면 기본 배포는 `DEPLOY_ACTIVE_RUN_EXISTS`로 중단된다. 불가피할 때만 영향 확인 후 `FORCE_DEPLOY=true bash scripts/deploy.sh`를 사용한다.

## 6. 인증서 갱신과 백업 자동화

root crontab 예시다. 실제 `<APP_DIRECTORY>`로 교체한다.

```cron
17 3 * * * cd <APP_DIRECTORY>/scenario-qa-app && bash scripts/renew-certificates.sh >> data/logs/certbot.log 2>&1
0 2 * * * cd <APP_DIRECTORY>/scenario-qa-app && bash scripts/backup.sh >> data/logs/backup.log 2>&1
```

갱신과 만료 확인:

```bash
bash scripts/renew-certificates.sh
docker compose --env-file .env.production run --rm certbot certificates
```

## 7. 백업, 복원, rollback

```bash
bash scripts/backup.sh
bash scripts/restore.sh data/backups/scenario-qa-backup-YYYYMMDD-HHMMSS.tar.gz --yes
bash scripts/rollback.sh
```

복원은 현재 데이터를 다시 백업하고, archive 경로와 manifest 및 JSON을 검증한 후 앱을 중지한다. 복원 후 health check가 실패하면 기존 데이터를 되돌리고 실패 데이터도 별도 디렉터리에 남긴다. `.env.production`까지 복원하려면 의도를 명시해 `RESTORE_ENV=true`를 사용한다.

## 8. SSH와 방화벽

UFW는 SSH 포트, 80, 443만 허용한다. Compose는 app의 3000 포트를 publish하지 않는다. SSH key 로그인이 두 번째 세션에서 정상임을 확인한 뒤에만 `/etc/ssh/sshd_config.d/99-scenario-qa.conf`에 아래 값을 적용한다.

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

적용 전 `sudo sshd -t`를 실행하고, 성공한 경우에만 `sudo systemctl reload ssh`를 수행한다. 접속 확인 전 기존 SSH 세션을 닫지 않는다.

## 9. 재부팅 및 영속성 검증

업무 영향이 없는 시간에 수행한다.

```bash
sudo reboot
# 재접속 후
cd <APP_DIRECTORY>/scenario-qa-app
docker compose --env-file .env.production ps
bash scripts/health-check.sh
```

브라우저에서 프로젝트를 하나 생성한 뒤 `docker compose down && docker compose up -d`를 수행하고 프로젝트, 실행 결과, 스크린샷, 예약, 알림 이력이 유지되는지 확인한다. 실제 reboot/재생성 검증을 하기 전에는 영속성 완료로 판정하지 않는다.

## 10. 장애 코드

스크립트는 `DEPLOY_BUILD_FAILED`, `DEPLOY_CONTAINER_START_FAILED`, `DEPLOY_HEALTH_CHECK_FAILED`, `DEPLOY_ROLLBACK_FAILED`, `DEPLOY_STORAGE_NOT_WRITABLE`, `DEPLOY_ARTIFACTS_NOT_WRITABLE`, `DEPLOY_PLAYWRIGHT_NOT_AVAILABLE`, `DEPLOY_CHROMIUM_START_FAILED`, `DEPLOY_NGINX_CONFIG_INVALID`, `DEPLOY_SSL_CERTIFICATE_FAILED`, `DEPLOY_DOMAIN_NOT_RESOLVED`, `DEPLOY_BACKUP_FAILED`, `DEPLOY_RESTORE_FAILED`, `DEPLOY_ACTIVE_RUN_EXISTS`, `DEPLOY_ENVIRONMENT_INVALID` 중 하나로 실패 원인을 표시한다.
