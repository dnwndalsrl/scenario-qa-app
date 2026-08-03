#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_command curl
load_environment
base_url="${HEALTH_BASE_URL:-https://${DOMAIN}}"
attempts="${HEALTH_CHECK_ATTEMPTS:-20}"
delay="${HEALTH_CHECK_DELAY_SECONDS:-3}"

for ((attempt=1; attempt<=attempts; attempt++)); do
  if compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(async r=>{if(!r.ok){console.error(await r.text());process.exit(1)}}).catch(e=>{console.error(e.message);process.exit(1)})" >/dev/null 2>&1; then
    break
  fi
  if (( attempt == attempts )); then
    fail DEPLOY_HEALTH_CHECK_FAILED "Internal readiness check did not pass after ${attempts} attempts."
  fi
  sleep "$delay"
done

curl --fail --silent --show-error --max-time 10 "${base_url}/api/health/live" >/dev/null \
  || fail DEPLOY_HEALTH_CHECK_FAILED "Public liveness endpoint failed."

unauthorized_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "${base_url}/")"
[[ "$unauthorized_status" == "401" ]] \
  || fail DEPLOY_HEALTH_CHECK_FAILED "Protected root returned HTTP ${unauthorized_status}, expected 401 without credentials."

if [[ -n "${BASIC_AUTH_USERNAME:-}" && -n "${BASIC_AUTH_PASSWORD:-}" ]]; then
  curl --fail --silent --show-error --max-time 15 --user "${BASIC_AUTH_USERNAME}:${BASIC_AUTH_PASSWORD}" "${base_url}/" >/dev/null \
    || fail DEPLOY_HEALTH_CHECK_FAILED "Authenticated browser entry check failed."
fi

printf 'Health checks passed for %s.\n' "$base_url"
