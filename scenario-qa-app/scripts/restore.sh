#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

archive="${1:-}"
confirmation="${2:-}"
[[ -n "$archive" && -f "$archive" ]] || fail DEPLOY_RESTORE_FAILED "Usage: scripts/restore.sh <backup.tar.gz> --yes"
[[ "$confirmation" == "--yes" ]] || fail DEPLOY_RESTORE_FAILED "Restore is destructive; repeat with --yes after verifying the archive."
require_command node
require_command tar
load_environment

archive="$(realpath -- "$archive")"
if tar -tzf "$archive" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  fail DEPLOY_RESTORE_FAILED "Archive contains an unsafe path."
fi

DATA_DIR="$APP_ROOT/data"
restore_root="$(mktemp -d "$DATA_DIR/.restore.XXXXXX")"
rollback_root="$DATA_DIR/.restore-rollback-$(date -u +%Y%m%d-%H%M%S)"
trap 'rm -rf -- "$restore_root"' EXIT
ensure_safe_data_path "$restore_root"
ensure_safe_data_path "$rollback_root"

tar -C "$restore_root" -xzf "$archive"
payload="$restore_root/scenario-qa-backup"
[[ -f "$payload/manifest.json" && -d "$payload/storage" && -d "$payload/artifacts" ]] \
  || fail DEPLOY_RESTORE_FAILED "Backup payload is incomplete."
node -e "const m=JSON.parse(require('fs').readFileSync(process.argv[1]));if(m.application!=='scenario-qa-app'||m.formatVersion!==1)process.exit(1)" "$payload/manifest.json" \
  || fail DEPLOY_RESTORE_FAILED "Backup manifest does not match scenario-qa-app format v1."
node "$SCRIPT_DIR/validate-storage-json.mjs" "$payload/storage" \
  || fail DEPLOY_RESTORE_FAILED "Backup storage JSON validation failed."

"$SCRIPT_DIR/backup.sh" >/dev/null \
  || fail DEPLOY_BACKUP_FAILED "Pre-restore backup failed; restore was cancelled."
compose stop app
mkdir -p "$rollback_root"
mv "$DATA_DIR/storage" "$rollback_root/storage"
mv "$DATA_DIR/artifacts" "$rollback_root/artifacts"
mv "$payload/storage" "$DATA_DIR/storage"
mv "$payload/artifacts" "$DATA_DIR/artifacts"
if [[ "${RESTORE_ENV:-false}" == "true" && -f "$payload/.env.production" ]]; then
  cp "$ENV_FILE" "$rollback_root/.env.production"
  cp "$payload/.env.production" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

if [[ "$(id -u)" -eq 0 ]]; then privilege=""; else privilege="sudo"; fi
$privilege chown -R 10001:"$(id -g)" "$DATA_DIR/storage" "$DATA_DIR/artifacts"
chmod 2770 "$DATA_DIR/storage" "$DATA_DIR/artifacts"
compose start app

if ! "$SCRIPT_DIR/health-check.sh"; then
  compose stop app
  mv "$DATA_DIR/storage" "$DATA_DIR/storage.failed-$(date -u +%s)"
  mv "$DATA_DIR/artifacts" "$DATA_DIR/artifacts.failed-$(date -u +%s)"
  mv "$rollback_root/storage" "$DATA_DIR/storage"
  mv "$rollback_root/artifacts" "$DATA_DIR/artifacts"
  if [[ -f "$rollback_root/.env.production" ]]; then cp "$rollback_root/.env.production" "$ENV_FILE"; fi
  compose start app
  fail DEPLOY_RESTORE_FAILED "Restored data failed health checks; the pre-restore data was recovered."
fi

printf 'Restore completed. Previous data remains recoverable at %s.\n' "$rollback_root"
