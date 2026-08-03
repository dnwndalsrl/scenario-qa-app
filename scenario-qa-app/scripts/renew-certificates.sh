#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_environment
compose run --rm certbot renew --webroot --webroot-path /var/www/certbot
compose exec -T nginx nginx -t
compose exec -T nginx nginx -s reload
compose run --rm certbot certificates
printf 'Certificate renewal check completed and Nginx was reloaded.\n'
