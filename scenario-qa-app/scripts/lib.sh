#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-${APP_ROOT}/.env.production}"
STATE_DIR="${APP_ROOT}/.deploy-state"

fail() {
  local code="$1"
  shift
  printf '%s: %s\n' "$code" "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail DEPLOY_ENVIRONMENT_INVALID "Required command is missing: $1"
}

load_environment() {
  [[ -f "$ENV_FILE" ]] || fail DEPLOY_ENVIRONMENT_INVALID "Missing ${ENV_FILE}. Copy .env.production.example and fill every placeholder."
  if grep -Eq '<(SERVER_IP|SSH_USER|DOMAIN|APP_DIRECTORY|LETSENCRYPT_EMAIL)>' "$ENV_FILE"; then
    fail DEPLOY_ENVIRONMENT_INVALID "Unresolved deployment placeholder exists in ${ENV_FILE}."
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  [[ -n "${DOMAIN:-}" ]] || fail DEPLOY_ENVIRONMENT_INVALID "DOMAIN is required."
  [[ -n "${APP_BASE_URL:-}" ]] || fail DEPLOY_ENVIRONMENT_INVALID "APP_BASE_URL is required."
  [[ "$APP_BASE_URL" == "https://${DOMAIN}" ]] || fail DEPLOY_ENVIRONMENT_INVALID "APP_BASE_URL must equal https://${DOMAIN}."
}

compose() {
  docker compose --project-directory "$APP_ROOT" --env-file "$ENV_FILE" "$@"
}

ensure_safe_data_path() {
  local candidate
  candidate="$(realpath -m -- "$1")"
  [[ "$candidate" == "${APP_ROOT}/data" || "$candidate" == "${APP_ROOT}/data/"* ]] \
    || fail DEPLOY_ENVIRONMENT_INVALID "Refusing path outside ${APP_ROOT}/data: ${candidate}"
}
