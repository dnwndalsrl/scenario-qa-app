#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_environment
require_command docker
[[ -n "${LETSENCRYPT_EMAIL:-}" ]] || fail DEPLOY_SSL_CERTIFICATE_FAILED "LETSENCRYPT_EMAIL is required."
[[ -f "$APP_ROOT/data/nginx/.htpasswd" ]] || fail DEPLOY_ENVIRONMENT_INVALID "Create Basic Auth first with scripts/create-basic-auth.sh."

export NGINX_CONFIG_FILE=bootstrap.conf.template
compose up -d app nginx \
  || fail DEPLOY_CONTAINER_START_FAILED "Could not start the HTTPS bootstrap services."

compose run --rm certbot certonly \
  --webroot --webroot-path /var/www/certbot \
  --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email \
  --cert-name "$DOMAIN" -d "$DOMAIN" \
  || fail DEPLOY_SSL_CERTIFICATE_FAILED "Let's Encrypt certificate issuance failed. Check DNS, ports 80/443, and certbot logs."

[[ -s "$APP_ROOT/data/certbot/conf/live/$DOMAIN/fullchain.pem" ]] \
  || fail DEPLOY_SSL_CERTIFICATE_FAILED "Certificate files were not created."
export NGINX_CONFIG_FILE=default.conf.template
compose up -d --force-recreate nginx
compose exec -T nginx nginx -t \
  || fail DEPLOY_NGINX_CONFIG_INVALID "Nginx configuration validation failed after certificate issuance."

"$SCRIPT_DIR/health-check.sh"
printf 'HTTPS bootstrap completed for https://%s.\n' "$DOMAIN"
