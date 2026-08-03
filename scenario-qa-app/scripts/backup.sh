#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_command node
require_command tar
load_environment

DATA_DIR="$APP_ROOT/data"
STORAGE_DIR="$DATA_DIR/storage"
ARTIFACTS_DIR="$DATA_DIR/artifacts"
BACKUP_DIR="$DATA_DIR/backups"
RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-10}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
timestamp="$(date -u +%Y%m%d-%H%M%S)"
archive="$BACKUP_DIR/scenario-qa-backup-${timestamp}.tar.gz"
staging="$(mktemp -d "$DATA_DIR/.backup.XXXXXX")"
trap 'rm -rf -- "$staging"' EXIT

ensure_safe_data_path "$BACKUP_DIR"
mkdir -p "$STORAGE_DIR" "$ARTIFACTS_DIR" "$BACKUP_DIR" "$staging/scenario-qa-backup"
umask 077

node "$SCRIPT_DIR/validate-storage-json.mjs" "$STORAGE_DIR" \
  || fail DEPLOY_BACKUP_FAILED "Storage JSON validation failed; no backup was created."
cp -a "$STORAGE_DIR" "$staging/scenario-qa-backup/storage"
cp -a "$ARTIFACTS_DIR" "$staging/scenario-qa-backup/artifacts"
cp "$ENV_FILE" "$staging/scenario-qa-backup/.env.production"
cat > "$staging/scenario-qa-backup/manifest.json" <<EOF
{"application":"scenario-qa-app","formatVersion":1,"createdAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","appVersion":"${APP_VERSION:-unknown}","artifactPolicy":"full"}
EOF

temporary_archive="${archive}.partial"
tar -C "$staging" -czf "$temporary_archive" scenario-qa-backup \
  || fail DEPLOY_BACKUP_FAILED "Could not create backup archive."
mv -- "$temporary_archive" "$archive"
chmod 600 "$archive"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'scenario-qa-backup-*.tar.gz' -mtime "+${RETENTION_DAYS}" -delete
mapfile -t backups < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'scenario-qa-backup-*.tar.gz' -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
if (( ${#backups[@]} > RETENTION_COUNT )); then
  for old_backup in "${backups[@]:RETENTION_COUNT}"; do
    ensure_safe_data_path "$old_backup"
    rm -- "$old_backup"
  done
fi

printf 'Backup created: %s\n' "$archive"
