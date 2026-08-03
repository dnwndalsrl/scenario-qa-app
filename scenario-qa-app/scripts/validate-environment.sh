#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_environment
require_command docker
docker compose version >/dev/null 2>&1 || fail DEPLOY_ENVIRONMENT_INVALID "Docker Compose v2 is required."
[[ "${NODE_ENV:-}" == "production" ]] || fail DEPLOY_ENVIRONMENT_INVALID "NODE_ENV must be production."
[[ "${ALLOW_LOCAL_TEST_TARGETS:-false}" == "false" ]] || fail DEPLOY_ENVIRONMENT_INVALID "ALLOW_LOCAL_TEST_TARGETS must be false."
[[ "${NUXT_STORAGE_ROOT:-}" == "/app/storage" ]] || fail DEPLOY_ENVIRONMENT_INVALID "NUXT_STORAGE_ROOT must be /app/storage."
[[ "${TEST_SCHEDULER_ENABLED:-true}" =~ ^(true|false)$ ]] || fail DEPLOY_ENVIRONMENT_INVALID "TEST_SCHEDULER_ENABLED must be true or false."
[[ "${MAX_CONCURRENT_TEST_RUNS:-1}" == "1" ]] || fail DEPLOY_ENVIRONMENT_INVALID "Initial single-server deployment requires MAX_CONCURRENT_TEST_RUNS=1."

if [[ "${NOTIFICATION_EMAIL_PROVIDER:-disabled}" == "smtp" ]]; then
  for name in NOTIFICATION_EMAIL_FROM SMTP_HOST SMTP_USER SMTP_PASSWORD; do
    [[ -n "${!name:-}" ]] || fail DEPLOY_ENVIRONMENT_INVALID "${name} is required when SMTP is enabled."
  done
fi
if [[ "${NOTIFICATION_SLACK_ENABLED:-false}" == "true" && ${#NOTIFICATION_ENCRYPTION_KEY} -lt 32 ]]; then
  fail DEPLOY_ENVIRONMENT_INVALID "NOTIFICATION_ENCRYPTION_KEY must contain at least 32 characters."
fi
if [[ -n "${OPENAI_SCENARIO_MODEL:-}${OPENAI_FAILURE_ANALYSIS_MODEL:-}${OPENAI_QUALITY_SUMMARY_MODEL:-}" && -z "${OPENAI_API_KEY:-}" ]]; then
  fail DEPLOY_ENVIRONMENT_INVALID "OPENAI_API_KEY is required when an OpenAI model is configured."
fi

printf 'Environment validation passed for %s (secret values were not printed).\n' "$DOMAIN"
