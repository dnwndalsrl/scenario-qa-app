#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_command openssl
username="${BASIC_AUTH_USERNAME:-}"
if [[ -z "$username" ]]; then
  read -r -p 'Basic Auth username: ' username
fi
[[ "$username" =~ ^[A-Za-z0-9._-]{3,64}$ ]] || fail DEPLOY_ENVIRONMENT_INVALID "Username must use 3-64 letters, numbers, dot, underscore, or hyphen."

password="${BASIC_AUTH_PASSWORD:-}"
if [[ -z "$password" ]]; then
  read -r -s -p 'Basic Auth password: ' password
  printf '\n'
  read -r -s -p 'Confirm password: ' confirmation
  printf '\n'
  [[ "$password" == "$confirmation" ]] || fail DEPLOY_ENVIRONMENT_INVALID "Passwords do not match."
fi
[[ ${#password} -ge 14 ]] || fail DEPLOY_ENVIRONMENT_INVALID "Password must contain at least 14 characters."

mkdir -p "$APP_ROOT/data/nginx"
umask 027
hash="$(openssl passwd -apr1 "$password")"
printf '%s:%s\n' "$username" "$hash" > "$APP_ROOT/data/nginx/.htpasswd"
unset password confirmation hash BASIC_AUTH_PASSWORD
if [[ "$(id -u)" -eq 0 ]]; then
  chown 0:101 "$APP_ROOT/data/nginx/.htpasswd"
else
  sudo chown 0:101 "$APP_ROOT/data/nginx/.htpasswd"
fi
chmod 640 "$APP_ROOT/data/nginx/.htpasswd"
printf 'Basic Auth file created. The plaintext password was not stored.\n'
