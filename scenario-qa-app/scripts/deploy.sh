#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_environment
"$SCRIPT_DIR/validate-environment.sh"
"$SCRIPT_DIR/prepare-directories.sh"
[[ -f "$APP_ROOT/data/nginx/.htpasswd" ]] || fail DEPLOY_ENVIRONMENT_INVALID "Run scripts/create-basic-auth.sh before deployment."

if [[ "${UPDATE_SOURCE:-false}" == "true" ]]; then
  require_command git
  git -C "$APP_ROOT" pull --ff-only
fi

set +e
node "$SCRIPT_DIR/check-active-runs.mjs" "$APP_ROOT/data/storage"
status=$?
set -e
if [[ "$status" -ne 0 ]]; then
  if [[ "$status" -eq 42 && "${FORCE_DEPLOY:-false}" != "true" ]]; then
    fail DEPLOY_ACTIVE_RUN_EXISTS "Active work exists. Wait for completion or explicitly set FORCE_DEPLOY=true."
  elif [[ "$status" -ne 42 ]]; then
    fail DEPLOY_STORAGE_NOT_WRITABLE "Could not inspect active work."
  fi
  printf 'WARNING: forcing deployment while active work exists.\n' >&2
fi

mkdir -p "$STATE_DIR"
previous_image=""
app_container="$(compose ps -q app 2>/dev/null || true)"
if [[ -n "$app_container" ]]; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "$app_container")"
  printf '%s\n' "$previous_image" > "$STATE_DIR/previous-image"
fi

backup_path="$("$SCRIPT_DIR/backup.sh" | sed -n 's/^Backup created: //p')"
[[ -n "$backup_path" ]] || fail DEPLOY_BACKUP_FAILED "Deployment backup was not created."
printf '%s\n' "$backup_path" > "$STATE_DIR/pre-deploy-backup"

git_sha="$(git -C "$APP_ROOT" rev-parse --short=12 HEAD 2>/dev/null || printf 'nogit')"
timestamp="$(date -u +%Y%m%d%H%M%S)"
export APP_IMAGE="${APP_IMAGE:-scenario-qa-app}"
export APP_VERSION="${git_sha}-${timestamp}"
export GIT_COMMIT_SHA="$git_sha"
export BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export DEPLOYED_AT="$BUILD_TIMESTAMP"
new_image="${APP_IMAGE}:${APP_VERSION}"

compose build app \
  || fail DEPLOY_BUILD_FAILED "Docker image build failed. Existing containers were left running."
compose up -d app \
  || fail DEPLOY_CONTAINER_START_FAILED "The application container did not start."

certificate="$APP_ROOT/data/certbot/conf/live/$DOMAIN/fullchain.pem"
if [[ ! -s "$certificate" ]]; then
  "$SCRIPT_DIR/bootstrap-https.sh" || {
    if [[ -n "$previous_image" ]]; then "$SCRIPT_DIR/rollback.sh" "$previous_image" || true; fi
    fail DEPLOY_SSL_CERTIFICATE_FAILED "Initial HTTPS setup failed."
  }
else
  export NGINX_CONFIG_FILE=default.conf.template
  compose up -d nginx \
    || fail DEPLOY_CONTAINER_START_FAILED "Nginx did not start."
  compose exec -T nginx nginx -t \
    || fail DEPLOY_NGINX_CONFIG_INVALID "Nginx configuration is invalid."
fi

if ! "$SCRIPT_DIR/health-check.sh"; then
  if [[ -n "$previous_image" ]]; then
    "$SCRIPT_DIR/rollback.sh" "$previous_image" \
      || fail DEPLOY_ROLLBACK_FAILED "New deployment and automatic rollback both failed."
  fi
  fail DEPLOY_HEALTH_CHECK_FAILED "New deployment failed health checks."
fi

printf '%s\n' "$new_image" > "$STATE_DIR/current-image"
printf '%s image=%s backup=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$new_image" "$backup_path" >> "$STATE_DIR/deployments.log"
docker image prune -f --filter 'until=720h' >/dev/null
printf 'Deployment completed: https://%s (%s)\n' "$DOMAIN" "$new_image"
