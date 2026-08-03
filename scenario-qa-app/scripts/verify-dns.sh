#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_environment
require_command getent
mapfile -t addresses < <(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u)
(( ${#addresses[@]} > 0 )) || fail DEPLOY_DOMAIN_NOT_RESOLVED "${DOMAIN} has no IPv4 address."
if [[ -n "${SERVER_IP:-}" ]] && ! printf '%s\n' "${addresses[@]}" | grep -Fxq "$SERVER_IP"; then
  fail DEPLOY_DOMAIN_NOT_RESOLVED "${DOMAIN} does not resolve to the configured SERVER_IP."
fi
printf '%s resolves to: %s\n' "$DOMAIN" "${addresses[*]}"
