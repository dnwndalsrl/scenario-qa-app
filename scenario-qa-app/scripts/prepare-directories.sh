#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

for directory in \
  "$APP_ROOT/data/storage" \
  "$APP_ROOT/data/artifacts" \
  "$APP_ROOT/data/backups" \
  "$APP_ROOT/data/logs" \
  "$APP_ROOT/data/nginx" \
  "$APP_ROOT/data/certbot/conf" \
  "$APP_ROOT/data/certbot/www" \
  "$STATE_DIR"; do
  if [[ "$directory" != "$STATE_DIR" ]]; then
    ensure_safe_data_path "$directory"
  fi
  mkdir -p -- "$directory"
done

chmod 750 "$APP_ROOT/data" "$APP_ROOT/data/storage" "$APP_ROOT/data/artifacts" "$APP_ROOT/data/backups" "$APP_ROOT/data/logs"
deploy_group="$(id -g)"
if [[ "$(id -u)" -eq 0 ]]; then
  chown -R 10001:"$deploy_group" "$APP_ROOT/data/storage" "$APP_ROOT/data/artifacts"
else
  sudo chown -R 10001:"$deploy_group" "$APP_ROOT/data/storage" "$APP_ROOT/data/artifacts"
fi
chmod 2770 "$APP_ROOT/data/storage" "$APP_ROOT/data/artifacts"
printf 'Persistent directories are ready under %s/data.\n' "$APP_ROOT"
