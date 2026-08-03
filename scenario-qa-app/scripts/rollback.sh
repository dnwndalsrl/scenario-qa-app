#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_environment
target_image="${1:-}"
if [[ -z "$target_image" && -f "$STATE_DIR/previous-image" ]]; then
  target_image="$(<"$STATE_DIR/previous-image")"
fi
[[ -n "$target_image" && "$target_image" == *:* ]] \
  || fail DEPLOY_ROLLBACK_FAILED "No rollback image is available."
docker image inspect "$target_image" >/dev/null 2>&1 \
  || fail DEPLOY_ROLLBACK_FAILED "Rollback image does not exist locally: ${target_image}"

export APP_IMAGE="${target_image%:*}"
export APP_VERSION="${target_image##*:}"
export NGINX_CONFIG_FILE=default.conf.template
compose up -d --no-build app nginx \
  || fail DEPLOY_ROLLBACK_FAILED "Could not start the rollback image."
"$SCRIPT_DIR/health-check.sh" \
  || fail DEPLOY_ROLLBACK_FAILED "Rollback image started but did not become healthy."

mkdir -p "$STATE_DIR"
printf '%s\n' "$target_image" > "$STATE_DIR/current-image"
printf '%s rollback=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$target_image" >> "$STATE_DIR/deployments.log"
printf 'Rollback completed: %s\n' "$target_image"
